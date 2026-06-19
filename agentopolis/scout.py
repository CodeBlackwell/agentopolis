"""Scout GitHub for repos that make good time-lapse movies: list trending or search by query,
clone each, score it with survey.evaluate, rank by movie potential. A light blob:none clone — enough
history for the formation ladder without downloading file contents; the top pick gets a full clone
only when you open its movie."""
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request

from . import survey

_UA = {"User-Agent": "agentopolis-scout"}
_SEARCH = "https://api.github.com/search/repositories?q={}&sort=stars&order=desc&per_page={}"
_TRENDING = "https://github.com/trending{}?since={}"
_ROW = re.compile(r'<h2 class="h3 lh-condensed">\s*<a [^>]*?href="/([^"/]+/[^"/]+)"')


def _get(url: str, headers: dict) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15).read()


def search(query: str, limit: int) -> list[str]:
    """owner/repo slugs for a GitHub search query (e.g. 'topic:visualization stars:>500'), most-starred first."""
    headers = dict(_UA, Accept="application/vnd.github+json")
    token = os.environ.get("GITHUB_TOKEN")               # optional: lifts the 10 req/min unauth search cap
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.loads(_get(_SEARCH.format(urllib.parse.quote(query), limit), headers))
    return [r["full_name"] for r in body["items"]]


def trending(since: str, language: str, limit: int) -> list[str]:
    """owner/repo slugs scraped from github.com/trending (since = daily|weekly|monthly)."""
    lang = "/" + urllib.parse.quote(language) if language else ""
    html = _get(_TRENDING.format(lang, since), _UA).decode()
    return _ROW.findall(html)[:limit]


def scout(query: str | None = None, since: str = "daily",
          language: str | None = None, limit: int = 20) -> list[dict]:
    """Rank GitHub repos by movie potential. A query searches; no query lists trending."""
    slugs = search(query, limit) if query else trending(since, language, limit)
    rows = []
    for slug in slugs:
        tmp = tempfile.mkdtemp(prefix="agentopolis-scout-")
        try:
            subprocess.run(["git", "clone", "--filter=blob:none", "--single-branch",
                            f"https://github.com/{slug}.git", tmp],
                           capture_output=True, timeout=180, check=True)
            row = survey.evaluate(tmp)
            if row:
                rows.append({**row, "slug": slug})
        except Exception as exc:                          # one bad/huge repo shouldn't sink the scout
            print(f"  skipped {slug} — {exc}")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows
