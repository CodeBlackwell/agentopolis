"""Server-side social card for a forged repo.

Plugs the cold-start unfurl hole: a shared link names its repo even before anyone
has built it (the name comes from the URL, no clone), and enriches with skyline
stats once the city bundle is cached. PNG via Pillow when available; returns None
otherwise so the caller falls back to the static card — keeping the CLI install at
its two declared deps while the hosted demo (which adds Pillow) gets rich cards.
"""
import re

from . import forge as forge_mod

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:                              # CLI installs ship fastapi+uvicorn only
    Image = None

PLUM, PLUM2, CREAM, GOLD, PINK = (36, 16, 32), (61, 24, 50), (249, 239, 227), (212, 169, 83), (199, 122, 170)
# size label by district count — a taxonomy, not a tuned threshold; explicit cuts read clearly
SIZE_LADDER = [(400, "a metropolis"), (120, "a city"), (30, "a town"), (0, "a village")]


def owner_repo(url: str) -> tuple[str | None, str | None]:
    m = re.match(r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$", url or "")
    return (m.group(1), m.group(2)) if m else (None, None)


def stats(url: str) -> dict | None:
    """Headline stats from a cached bundle (full city or movie), or None if not built yet."""
    bundle = forge_mod.peek(url) or (forge_mod.peek_tl(url) or {}).get("data")
    if not bundle:
        return None
    buildings = bundle["buildings"]
    dropped = bundle.get("sample", {})
    files = sum(b.get("files", 0) for b in buildings) + dropped.get("files", {}).get("dropped", 0)
    districts = len(buildings) + dropped.get("buildings", {}).get("dropped", 0)
    loc = sum(b.get("loc", 0) for b in buildings)
    size = next(label for cut, label in SIZE_LADDER if districts >= cut)
    return {"files": files, "districts": districts, "loc": loc, "size": size}


def card_png(url: str) -> bytes | None:
    """1200x630 branded PNG naming the repo (+ stats when known). None if Pillow is unavailable."""
    if Image is None:
        return None
    owner, repo = owner_repo(url)
    if not repo:
        return None
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), PLUM)
    d = ImageDraw.Draw(img)
    for y in range(H):                           # plum vertical gradient so it reads as the app
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(PLUM, PLUM2)))
    font = ImageFont.load_default
    d.text((W / 2, 150), f"{owner}/{repo}", font=font(size=86), fill=CREAM, anchor="mm")
    d.text((W / 2, 240), "a codebase as a living isometric city", font=font(size=34), fill=PINK, anchor="mm")
    s = stats(url)
    if s:
        row = f"{s['files']:,} files   ·   {s['districts']:,} districts   ·   {s['loc']:,} lines"
        d.text((W / 2, 360), row, font=font(size=40), fill=GOLD, anchor="mm")
        d.text((W / 2, 430), s["size"], font=font(size=30), fill=PINK, anchor="mm")
    else:
        d.text((W / 2, 380), "paste it to watch it build itself", font=font(size=34), fill=GOLD, anchor="mm")
    d.text((W / 2, 560), "agentopolis.codeblackwell.ai  ·  built by Claude Code",
           font=font(size=26), fill=PINK, anchor="mm")
    from io import BytesIO
    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()
