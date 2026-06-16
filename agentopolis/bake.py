"""Bake a static showcase from a workspace (run locally, never on the server).

Seeds the nation + each city once and writes fixtures the server serves with
zero live git. The fixtures carry real paths + stats (gitignored and rsynced
to the host, never public git); only docker image/service names are normalized
so private registries aren't named. Near-duplicate repos (specter-1,
specter-1-private, specter-1-wave2 ...) collapse to one city.

    python -m agentopolis.bake [WORKSPACE_ROOT] [OUT_DIR]
"""
import json
import os
import re
import sys
import tempfile
from pathlib import Path

from .nation import load_nation
from .seed import seed
from .timeline import build_timeline
from .zone import load_zone

VARIANT = re.compile(r"-(private|integration|wave\d+|mvp)$")


def canonical(repo: str) -> str:
    return VARIANT.sub("", repo)


def dedup(nat: dict) -> dict:
    """Collapse variant repos to their base city (first one seen wins)."""
    seen: dict[str, str] = {}
    drop = set()
    for c in nat["cities"]:
        key = canonical(c["repo"])
        if key in seen:
            drop.add(c["repo"])
        else:
            seen[key] = c["repo"]
    nat["cities"] = [c for c in nat["cities"] if c["repo"] not in drop]
    for st in nat["states"]:
        st["repos"] = [r for r in st["repos"] if r not in drop]
    nat["states"] = [st for st in nat["states"] if st["repos"]]
    return nat


# Well-known public images/services keep their name; anything else (private registries,
# project-specific images) is redacted so the public demo never names them.
KNOWN_IMAGES = {
    "postgres", "postgresql", "timescaledb", "pgvector", "mysql", "mariadb", "redis",
    "valkey", "mongo", "mongodb", "memcached", "clickhouse", "nginx", "caddy", "traefik",
    "httpd", "node", "python", "golang", "go", "rust", "ruby", "php", "openjdk", "java",
    "deno", "bun", "alpine", "ubuntu", "debian", "busybox", "scratch", "neo4j",
    "elasticsearch", "opensearch", "qdrant", "weaviate", "rabbitmq", "kafka", "nats",
    "minio", "vault", "consul", "etcd", "grafana", "prometheus", "loki", "ollama",
    "localstack", "selenium", "mailhog", "adminer", "pgadmin", "supabase",
}


def image_family(name: str) -> str:
    base = name.split(":")[0].rsplit("/", 1)[-1].lower()    # drop tag + registry/org prefix
    return base if base in KNOWN_IMAGES else "service"


def protect_docker(data: dict) -> None:
    """Keep recognizable image/service families; redact custom names (count is preserved)."""
    for d in data["docker"]:
        d["items"] = [image_family(it) for it in d.get("items", [])]


def build_nation(root: str) -> dict:
    # an empty manifest skips the mother-metropolis path, so repos group into family biomes
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        f.write('{"states": []}')
        manifest = f.name
    nat = load_nation(root, manifest)
    Path(manifest).unlink()
    return dedup(nat)


def main() -> None:
    root = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent / "showcase"
    (out / "cities").mkdir(parents=True, exist_ok=True)
    (out / "timelines").mkdir(parents=True, exist_ok=True)
    demo = os.environ.get("AGENTOPOLIS_DEMO_CITY")     # only the landing city plays a movie → only it needs a timeline

    nat = build_nation(root)
    (out / "nation.json").write_text(json.dumps(nat))

    for c in nat["cities"]:
        repo = c["repo"]
        data = seed(str(Path(root) / repo), load_zone(str(Path(root) / repo), None))
        protect_docker(data)
        (out / "cities" / f"{repo}.json").write_text(json.dumps(data))
        note = f"  {repo} ({len(data['buildings'])} buildings)"
        if repo == demo:
            tl = build_timeline(str(Path(root) / repo))
            (out / "timelines" / f"{repo}.json").write_text(json.dumps(tl))
            note += f" + timeline ({len(tl['commits'])} commits)"
        print(note)

    print(f"baked {len(nat['cities'])} cities → {out}")


if __name__ == "__main__":
    main()
