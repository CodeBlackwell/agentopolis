"""Browser proof for the client-side virality features.

These can only be proven in a real DOM/canvas, so they drive a headless browser
against a live server seeded from THIS repo (deterministic, no network clone).
Skips cleanly when Playwright browsers aren't installed:
    uv run --extra test playwright install chromium
    uv run --extra test pytest tests/test_ui.py
"""
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

REPO = str(Path(__file__).resolve().parent.parent)
sync_playwright = pytest.importorskip("playwright.sync_api").sync_playwright


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope="session")
def base_url():
    port = _free_port()
    env = {"PATH": __import__("os").environ["PATH"], "AGENTOPOLIS_REPO": REPO}
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "agentopolis.server:app",
                             "--port", str(port)], env=env, cwd=REPO)
    url = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):                       # wait for liveness
            try:
                if urllib.request.urlopen(url + "/health", timeout=1).status == 200:
                    break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("server did not start")
        yield url
    finally:
        proc.terminate()
        proc.wait(timeout=5)


@pytest.fixture(scope="session")
def browser():
    try:
        pw = sync_playwright().start()
        b = pw.chromium.launch()
    except Exception as e:
        pytest.skip(f"Playwright chromium unavailable ({e}); run `playwright install chromium`")
    yield b
    b.close()
    pw.stop()


@pytest.fixture
def page(browser):
    ctx = browser.new_context(viewport={"width": 1200, "height": 800}, accept_downloads=True)
    pg = ctx.new_page()
    pg.add_init_script("try { localStorage.setItem('agentopolis-tour-done', '1'); } catch (e) {}")  # skip first-visit tour
    yield pg
    ctx.close()


def _open_city(page, base_url):
    page.goto(base_url + "/")                       # local repo -> live city
    page.wait_for_function("window.CITY_STATS && window.CITY_STATS.districts > 0", timeout=15000)


# ---- #6 / #7 repo-specific caption with stats --------------------------------

def test_city_stats_are_populated_from_real_data(page, base_url):
    _open_city(page, base_url)
    stats = page.evaluate("window.CITY_STATS")
    assert stats["files"] > 0 and stats["districts"] > 0   # computed from the seeded skyline, not hardcoded


def test_caption_names_the_repo_and_carries_a_stat(page, base_url):
    _open_city(page, base_url)
    text = page.evaluate("window.__share.text()")
    assert "isometric city" in text
    assert Path(REPO).name in text                         # the repo dir name (data-hall-name)
    assert any(ch.isdigit() for ch in text)                # a headline number, not the old static line


# ---- Share button opens a destination menu (not auto-record), #8 X-intent + #7 caption -----

def test_share_button_opens_a_destination_menu(page, base_url):
    # clicking Share must open a menu of destinations — NOT immediately record/share
    page.add_init_script("Object.defineProperty(navigator,'share',{value:undefined,configurable:true});")
    _open_city(page, base_url)
    page.wait_for_selector("#share")
    page.click("#share")
    page.wait_for_selector("#share-menu", timeout=10000)
    labels = page.eval_on_selector_all("#share-menu button", "els => els.map(e => e.textContent)")
    for expected in ["post to X", "share on linkedin", "post to reddit", "copy link", "download image"]:
        assert expected in labels, f"missing menu item: {expected}"


def test_menu_post_to_x_opens_prefilled_intent(page, base_url):
    page.add_init_script("""
        Object.defineProperty(navigator, 'share', {value: undefined, configurable: true});
        window.__opened = [];
        window.open = (...a) => { window.__opened.push(a); return {closed: false}; };
    """)
    _open_city(page, base_url)
    page.wait_for_selector("#share")
    page.click("#share")
    page.wait_for_selector("#share-menu")
    page.click("#share-menu >> text=post to X")
    # #8 + #7: a twitter intent opens, prefilled with the caption + the canonical link
    page.wait_for_function("window.__opened.length > 0", timeout=10000)
    intent = page.evaluate("window.__opened[0][0]")
    assert intent.startswith("https://twitter.com/intent/tweet")
    assert "isometric%20city" in intent or "isometric+city" in intent
    assert "text=" in intent and "url=" in intent
    page.wait_for_selector("#share-menu", state="detached")   # menu closes after choosing


def test_share_does_not_record_on_open(page, base_url):
    # regression for the reported bug: in a movie, opening the menu must NOT kick off clip recording.
    # Spy by wrapping the recorder as the page assigns it (getter/setter), so the test never calls it itself.
    page.add_init_script("""
        window.__recorded = 0;
        let _rec;
        Object.defineProperty(window, 'recordTimelapseClip', { configurable: true,
            get() { return _rec; },
            set(fn) { _rec = (...a) => { window.__recorded++; return fn(...a); }; } });
        Object.defineProperty(navigator, 'share', {value: undefined, configurable: true});
    """)
    page.goto(base_url + "/?timelapse")                       # movie context, where the old bug auto-recorded
    page.wait_for_function("typeof window.recordTimelapseClip === 'function'", timeout=15000)
    page.wait_for_selector("#share")
    page.click("#share")
    page.wait_for_selector("#share-menu")
    assert page.evaluate("window.__recorded") == 0            # opening the menu records nothing
    labels = page.eval_on_selector_all("#share-menu button", "els => els.map(e => e.textContent)")
    assert "download clip" in labels                          # the clip is an explicit, opt-in menu choice


# ---- #3 video end-card -------------------------------------------------------

def _open_movie(page, base_url):
    page.goto(base_url + "/?timelapse")                    # local repo -> build movie
    page.wait_for_function("window.__endCard !== undefined", timeout=15000)


def test_end_card_paints_over_the_final_frame(page, base_url):
    _open_movie(page, base_url)
    # drawing the end-card must mutate the canvas (the branded outro renders)
    changed = page.evaluate("""() => {
        const c = document.getElementById('map');
        const before = c.toDataURL();
        window.__endCard.draw(performance.now());
        return before !== c.toDataURL();
    }""")
    assert changed is True


def test_end_card_text_is_the_branded_attribution(page, base_url):
    _open_movie(page, base_url)
    # no forge param on a local city -> the bare domain; the /c/owner/repo branch is covered server-side
    assert page.evaluate("window.__endCard.text()") == "agentopolis.codeblackwell.ai"


def test_recorded_clip_is_a_real_video_blob(page, base_url):
    _open_movie(page, base_url)
    clip = page.evaluate("""async () => {
        const b = await window.recordTimelapseClip();
        return b ? {size: b.size, type: b.type} : null;
    }""")
    if clip is None:
        pytest.skip("MediaRecorder/codec unavailable in this browser build")
    assert clip["size"] > 0 and clip["type"].startswith("video/")   # the end-card rides inside this clip


# ---- #10 adaptive capture fps ------------------------------------------------

def test_capture_fps_drops_on_low_core_devices(page, base_url):
    _open_movie(page, base_url)
    assert page.evaluate("window.__endCard.fps(2)") == 24
    assert page.evaluate("window.__endCard.fps(4)") == 24
    assert page.evaluate("window.__endCard.fps(8)") == 30


# ---- #5 identity hook --------------------------------------------------------

def test_forge_funnel_pushes_your_own_repo(page, base_url):
    _open_city(page, base_url)
    hint = page.locator(".forge-hint").inner_text()
    assert "your" in hint.lower()                          # nudges the visitor's own repo, not a famous one
    placeholder = page.get_attribute("#forge input", "placeholder")
    assert "your repo" in placeholder.lower()
    # and it actually surfaces in the funnel context (demo/nation), not just hidden in the DOM
    shown = page.evaluate("""() => {
        document.body.dataset.demo = '1';
        return getComputedStyle(document.getElementById('forge')).display !== 'none';
    }""")
    assert shown is True
