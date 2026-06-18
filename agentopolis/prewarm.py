"""Pre-warm the demo landing's og:video so a freshly-shared link unfurls with inline playback
without waiting for a human viewer to render one. Headless-loads the live movie, records one
fast pass, and POSTs it to /og-video (the same endpoint the browser uses). Runs post-deploy
(`just prewarm` / the release deploy job). Needs Playwright's chromium — a deploy-time dep, never
shipped in the prod image."""
import os
import sys

from playwright.sync_api import sync_playwright

RECORD_AND_UPLOAD = """async () => {
    const blob = await window.recordTimelapseClip();
    if (!blob) return 'no-recorder';
    const key = window.DEMO_CITY || '';
    const r = await fetch('/og-video?key=' + encodeURIComponent(key),
        { method: 'POST', headers: { 'Content-Type': blob.type || 'video/webm' }, body: blob });
    return key + ' -> ' + r.status;
}"""


def prewarm(base_url: str) -> str:
    with sync_playwright() as play:
        browser = play.chromium.launch(args=["--no-sandbox"])
        page = browser.new_page()
        page.goto(base_url, wait_until="load")
        # CITY_STATS lands only after the timeline data loads — wait for it so the record isn't a blank race
        page.wait_for_function(
            "window.MOVIE && window.CITY_STATS && typeof window.recordTimelapseClip === 'function'", timeout=30000)
        result = page.evaluate(RECORD_AND_UPLOAD)        # records a full pass, uploads, returns "<key> -> <status>"
        browser.close()
        return result


if __name__ == "__main__":
    base = os.environ.get("AGENTOPOLIS_PUBLIC_URL", "http://localhost:4242")
    result = prewarm(base)
    print("prewarm:", result)
    sys.exit(0 if result.endswith("-> 200") else 1)
