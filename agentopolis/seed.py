"""Build a city snapshot from a git repo + zoning manifest.

Per building: loc (mass), commits + age (attention), centrality (how many
other components it has co-committed with). A component may set "group": N
to aggregate files into one building per N-segment path prefix.
"""
import json
import re
import subprocess
import time
from collections import Counter
from fnmatch import fnmatch
from pathlib import Path

CLASS = re.compile(r"^\s*(export |abstract |public |final )*(class|interface|struct|trait)\b")
IMPORT = re.compile(r"^\s*(import|from|require|use|#include)\b|=\s*require\(")
TODO = re.compile(r"TODO|FIXME|HACK")
FROM = re.compile(r"^\s*FROM\s+(\S+)", re.I)
FROM_AS = re.compile(r"\bAS\s+(\S+)", re.I)

# A dependency name (substring match) marks the district that declares it as a cloud client.
DEP_CLOUDS = [
    ("AWS", ("boto3", "botocore", "aioboto3", "aws-sdk", "aws-cdk")),
    ("GCP", ("google-cloud", "google-api-python-client", "firebase")),
    ("Azure", ("azure-", "@azure/")),
    ("Cloudflare", ("cloudflare", "wrangler")),
    ("Supabase", ("supabase",)),
    ("Vercel", ("@vercel",)),
    ("Stripe", ("stripe",)),
    ("OpenAI", ("openai",)),
    ("Anthropic", ("anthropic",)),
    ("Clerk", ("clerk",)),
    ("Twilio", ("twilio",)),
    ("Sentry", ("sentry",)),
    ("Datadog", ("datadog", "ddtrace")),
]
# A file (glob on full path or basename) marks the district that owns it as a cloud user.
FILE_CLOUDS = [
    ("GitHub Actions", ("*.github/workflows/*",)),
    ("Terraform", ("*.tf", "*.tf.json")),
    ("Vercel", ("vercel.json",)),
    ("Fly.io", ("fly.toml",)),
    ("Render", ("render.yaml", "render.yml")),
    ("Heroku", ("procfile",)),
    ("Netlify", ("netlify.toml",)),
    ("Cloudflare", ("wrangler.toml", "wrangler.json", "wrangler.jsonc")),
]


# Sampling caps so a huge repo degrades gracefully instead of being rejected. scan() reads every line of
# every file, so cap files BEFORE scanning (ranked by commits, then bytes); render cost scales with the
# building count, so cap that too (ranked by mass). These bound CPU/draw cost, not repo shape.
FILE_CAP = 6000
BUILDING_CAP = 1500


def git(repo: str, *args: str) -> str:
    # quotepath=false: emit unicode/spaced paths literally, not C-escaped octal (\342\200\224)
    return subprocess.run(["git", "-C", repo, "-c", "core.quotepath=false", *args],
                          capture_output=True, text=True).stdout


def tracked(repo: str, exclude: set | None = None) -> list[str]:
    files = git(repo, "ls-files").splitlines()
    if exclude:                                  # drop nested-repo dirs when seeding a mother's capital
        files = [f for f in files if f.split("/", 1)[0] not in exclude]
    return files


def component_of(path: str, components: list) -> str | None:
    for c in components:
        if any(fnmatch(path, g) for g in c["globs"]):
            return c["id"]
    return None


def filesize(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def scan(path: Path) -> tuple[int, int, int, int]:
    loc = classes = imports = todos = 0
    try:
        for line in open(path, errors="ignore"):
            loc += 1
            if CLASS.match(line):
                classes += 1
            elif IMPORT.search(line):
                imports += 1
            if TODO.search(line):
                todos += 1
    except OSError:
        pass
    return loc, classes, imports, todos


def parse_deps(repo: str, files: list[str]) -> list[str]:
    import tomllib
    found = set()
    for f in files:
        name = f.rsplit("/", 1)[-1].lower()
        if name not in ("package.json", "pyproject.toml") and \
           not (name.startswith("requirements") and name.endswith(".txt")):
            continue
        try:
            text = Path(repo, f).read_text(errors="ignore")
            if name == "package.json":
                data = json.loads(text)
                found |= set(data.get("dependencies", {})) | set(data.get("devDependencies", {}))
            elif name == "pyproject.toml":
                reqs = tomllib.loads(text).get("project", {}).get("dependencies", [])
                found |= {re.split(r"[<>=~!\[; ]", r, 1)[0] for r in reqs}
            else:
                found |= {re.split(r"[<>=~!\[; ]", li.strip(), 1)[0]
                          for li in text.splitlines() if li.strip() and li.lstrip()[0] not in "#-"}
        except (ValueError, OSError):            # fixture/vendored manifests may be malformed
            continue
    return sorted(found)


def detect_clouds(repo: str, comp: dict[str, str | None]) -> list[dict]:
    """Fingerprint cloud providers from deps + config files; tether each to its district."""
    def real(c):                                          # a real district, not civic/shared scaffolding
        return c and c not in ("civic", "commons")
    files = Counter(c for c in comp.values() if c)
    default = next((c for c, _ in files.most_common() if real(c)),
                   files.most_common(1)[0][0] if files else None)
    votes: dict[str, Counter] = {}
    for f, c in comp.items():
        name = f.rsplit("/", 1)[-1].lower()
        is_manifest = name in ("package.json", "pyproject.toml") or \
            (name.startswith("requirements") and name.endswith(".txt"))
        for dep in parse_deps(repo, [f]) if is_manifest else []:
            for label, fps in DEP_CLOUDS:
                if any(fp in dep for fp in fps):
                    votes.setdefault(label, Counter())[c or default] += 1
        for label, pats in FILE_CLOUDS:
            if any(fnmatch(f, p) or fnmatch(name, p) for p in pats):
                votes.setdefault(label, Counter())[c or default] += 1
    clouds = []
    for label, counter in votes.items():
        ranked = [cid for cid, _ in counter.most_common() if cid]
        tether = next((c for c in ranked if real(c)), (ranked or [default])[0])
        if tether:
            clouds.append({"name": label, "tether": tether})
    return clouds


def compose_services(repo: str, f: str) -> list[str]:
    """Service keys under a compose file's top-level `services:` block (light indent parse, no yaml dep)."""
    try:
        lines = Path(repo, f).read_text(errors="ignore").splitlines()
    except OSError:
        return []
    out: list[str] = []
    in_services = indent = None
    for line in lines:
        body = line.strip()
        if not body or body.startswith("#"):
            continue
        col = len(line) - len(line.lstrip())
        if in_services is None:
            in_services = body == "services:" or None
        elif col == 0:                              # dedented out of the services block
            break
        else:
            indent = col if indent is None else indent
            if col == indent and body.endswith(":"):
                out.append(body[:-1].strip())
    return out


def dockerfile_images(repo: str, f: str) -> list[str]:
    out: list[str] = []
    stages: set[str] = set()                        # multi-stage names so `FROM builder` isn't a base image
    try:
        for line in open(Path(repo, f), errors="ignore"):
            m = FROM.match(line)
            if not m:
                continue
            img = m.group(1).rsplit("/", 1)[-1].split("@")[0]
            if img.lower() != "scratch" and img not in stages and img not in out:
                out.append(img)
            stage = FROM_AS.search(line)
            if stage:
                stages.add(stage.group(1))
    except OSError:
        pass
    return out


def docker_manifest(repo: str, files) -> list[dict]:
    """Each compose/Dockerfile as a harbor ship; its items are the services / base images it runs."""
    arts = []
    for f in files:
        name = f.rsplit("/", 1)[-1].lower()
        if "compose.y" in name:
            arts.append({"path": f, "kind": "compose", "items": compose_services(repo, f)})
        elif "dockerfile" in name:
            arts.append({"path": f, "kind": "image", "items": dockerfile_images(repo, f)})
    return arts


def dead_files(repo: str, alive: set[str]) -> list[dict]:
    cemetery = max(1, len(alive) // 2)          # graves scale with the living city, not a flat cap
    died: dict[str, int] = {}                   # path -> deletion commit time (newest deletion wins)
    ts = 0
    for line in git(repo, "log", "-M", "--diff-filter=D", "--name-only", "--pretty=%ct").splitlines():
        if line.isdigit():
            ts = int(line)
        elif line and line not in alive and line not in died:
            died[line] = ts
            if len(died) >= cemetery:           # cemetery plot capacity (relative to living buildings)
                break
    born: dict[str, int] = {}                   # earliest add: newest-first log, last write is oldest
    ts = 0
    for line in git(repo, "log", "--diff-filter=A", "--name-only", "--pretty=%ct").splitlines():
        if line.isdigit():
            ts = int(line)
        elif line in died:
            born[line] = ts
    return [{"path": p, "born": born.get(p), "died": d} for p, d in died.items()]


def seed(repo: str, zone: dict, exclude: set | None = None, walk_history: bool = True) -> dict:
    # walk_history=False skips the per-file git-log walk + dead_files (the expensive part). The movie path
    # passes False: it derives commits/centrality/dead client-side from the timeline it already builds.
    comp = {f: component_of(f, zone["components"]) for f in tracked(repo, exclude)}
    files = [f for f, c in comp.items() if c]
    n_files = len(files)
    mega = max(15, n_files // 50)                    # "sweeping commit" scales with repo size (≥15 floor)
    group = {c["id"]: c.get("group") for c in zone["components"]}

    commits = dict.fromkeys(files, 0)
    last = dict.fromkeys(files, 0)
    cocomp = {f: set() for f in files}
    timestamp = 0
    touched: list[str] = []
    for line in (git(repo, "log", "--name-only", "--pretty=%ct").splitlines() + [""]) if walk_history else []:
        if line.isdigit() or not line:                  # commit boundary: flush previous
            comps = {comp[f] for f in touched}
            for f in touched:
                commits[f] += 1
                last[f] = max(last[f], timestamp)
                if len(touched) <= mega:                # mega-commits aren't coupling signal
                    cocomp[f] |= comps - {comp[f]}
            touched = []
            if line.isdigit():
                timestamp = int(line)
        elif line in commits:
            touched.append(line)

    dropped_files = 0
    if n_files > FILE_CAP:                               # too big to scan whole: keep the living core
        size = {f: filesize(Path(repo, f)) for f in files}   # attention first, mass (bytes) as the cheap fallback
        files = sorted(files, key=lambda f: (commits[f], size[f]), reverse=True)[:FILE_CAP]
        dropped_files = n_files - FILE_CAP

    buildings: dict[str, dict] = {}
    exts: dict[str, Counter] = {}
    now = time.time()
    for f in sorted(files):
        depth = group[comp[f]]
        key = "/".join(f.split("/")[:depth]) if depth else f
        b = buildings.setdefault(key, {"path": key, "component": comp[f], "loc": 0,
                                       "commits": 0, "centrality": 0, "age_days": 9999, "files": 0,
                                       "classes": 0, "imports": 0, "todos": 0})
        loc, classes, imports, todos = scan(Path(repo, f))
        b["loc"] += loc
        b["classes"] += classes
        b["imports"] += imports
        b["todos"] += todos
        b["commits"] += commits[f]
        b["centrality"] = max(b["centrality"], len(cocomp[f]))
        if last[f]:
            b["age_days"] = min(b["age_days"], round((now - last[f]) / 86400))
        b["files"] += 1
        exts.setdefault(key, Counter())[Path(f).suffix.lstrip(".").lower()] += 1
    for key, b in buildings.items():
        b["ext"] = exts[key].most_common(1)[0][0]

    dropped_buildings = 0
    if len(buildings) > BUILDING_CAP:                    # too many to render: keep the tallest skyline
        kept = sorted(buildings.values(), key=lambda b: b["loc"], reverse=True)[:BUILDING_CAP]
        dropped_buildings = len(buildings) - BUILDING_CAP
        buildings = {b["path"]: b for b in kept}

    docker = docker_manifest(repo, comp)
    named = {c["name"].lower() for c in zone.get("clouds", [])}    # manual clouds win
    zone["clouds"] = zone.get("clouds", []) + \
        [c for c in detect_clouds(repo, comp) if c["name"].lower() not in named]
    result = {"zone": zone, "buildings": list(buildings.values()),
              "deps": parse_deps(repo, list(comp)), "docker": docker,
              "dead": dead_files(repo, set(comp)) if walk_history else []}
    sample = {}
    if dropped_files:
        sample["files"] = {"shown": FILE_CAP, "dropped": dropped_files}
    if dropped_buildings:
        sample["buildings"] = {"shown": BUILDING_CAP, "dropped": dropped_buildings}
    if sample:
        result["sample"] = sample
    return result
