"""Functional proof for the virality server-side features.

Each test drives the real ASGI app (or the real og module) and asserts observable
behavior — not that a string exists in the source. Run: `uv run --extra test pytest`.
"""
import json
from io import BytesIO

import pytest
from starlette.testclient import TestClient

from agentopolis import forge as forge_mod
from agentopolis import og, server


@pytest.fixture
def client():
    return TestClient(server.app)


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    server.loop.clear()                       # isolate funnel counters per test
    monkeypatch.setattr(server, "STATS_FILE", None)
    monkeypatch.setattr(server, "STATS_TOKEN", None)
    monkeypatch.setattr(server, "PLAYER_CARD", None)
    forge_mod.forged.pop("https://github.com/test/repo", None)
    yield


# ---- #11 clean canonical URL -------------------------------------------------

def test_canonical_route_forges_that_repo(client):
    r = client.get("/c/facebook/react")
    assert r.status_code == 200
    assert "react City" in r.text                              # heading names the repo
    assert 'href="https://github.com/facebook/react"' in r.text   # source link
    assert "city-timelapse.js" in r.text                       # forge defaults to the build movie


def test_canonical_is_the_advertised_og_url(client):
    r = client.get("/c/facebook/react")
    assert '<link rel="canonical" href="http://testserver/c/facebook/react">' in r.text
    assert 'property="og:url" content="http://testserver/c/facebook/react"' in r.text


def test_forge_query_still_advertises_the_clean_canonical(client):
    # a messy ?forge= link must unfurl as the clean /c/owner/repo canonical, not echo itself
    r = client.get("/?forge=https://github.com/facebook/react")
    assert '<link rel="canonical" href="http://testserver/c/facebook/react">' in r.text


# ---- #1 loop instrumentation -------------------------------------------------

def test_land_and_share_edges_count(client):
    client.get("/c/facebook/react")                            # land
    client.get("/e/share_tapped")
    client.get("/e/share_completed")
    stats = client.get("/stats").json()
    assert stats["land"] == 1
    assert stats["share_tapped"] == 1
    assert stats["share_completed"] == 1


def test_forge_endpoint_counts_a_build(client):
    client.get("/forge?url=not-a-github-url")                  # 400, but the attempt is the funnel signal
    assert client.get("/stats").json().get("forge") == 1


def test_beacon_allowlist_rejects_unknown_edges(client):
    client.get("/e/__sneaky__")
    client.get("/e/build_your_own")
    stats = client.get("/stats").json()
    assert "__sneaky__" not in stats                           # no unbounded key growth from the public beacon
    assert stats["build_your_own"] == 1


def test_counts_persist_through_the_stats_file(tmp_path, monkeypatch):
    f = tmp_path / "stats.json"
    monkeypatch.setattr(server, "STATS_FILE", f)
    server.loop.clear()
    server.bump("forge")
    server.bump("forge")
    assert json.loads(f.read_text())["forge"] == 2             # survives a restart


def test_stats_route_is_token_gated_when_configured(client, monkeypatch):
    monkeypatch.setattr(server, "STATS_TOKEN", "s3cret")
    assert client.get("/stats").status_code == 404             # hidden without the token
    assert client.get("/stats?token=s3cret").status_code == 200


# ---- #2 cold-start server card + #6 stats ------------------------------------

def test_owner_repo_parse():
    assert og.owner_repo("https://github.com/facebook/react") == ("facebook", "react")
    assert og.owner_repo("https://github.com/facebook/react.git") == ("facebook", "react")
    assert og.owner_repo("https://example.com/x") == (None, None)


def test_stats_is_none_for_an_unbuilt_repo():
    assert og.stats("https://github.com/never/built") is None


def test_stats_sum_files_districts_loc_and_size():
    url = "https://github.com/test/repo"
    forge_mod.forged[url] = {"buildings": [{"files": 3, "loc": 100}, {"files": 2, "loc": 50}],
                             "sample": {"files": {"dropped": 5}, "buildings": {"dropped": 1}}}
    s = og.stats(url)
    assert s["files"] == 3 + 2 + 5                             # dropped sampled files are added back
    assert s["districts"] == 2 + 1
    assert s["loc"] == 150
    assert s["size"] == "a village"


def test_size_ladder_climbs_with_districts():
    url = "https://github.com/test/repo"
    forge_mod.forged[url] = {"buildings": [{"files": 1, "loc": 1}] * 130}
    assert og.stats(url)["size"] == "a city"


@pytest.mark.skipif(og.Image is None, reason="Pillow not installed (CLI install path)")
def test_card_png_is_a_valid_1200x630_png():
    png = og.card_png("https://github.com/facebook/react")
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    from PIL import Image
    assert Image.open(BytesIO(png)).size == (1200, 630)


def test_og_card_route_serves_an_image(client):
    r = client.get("/og-card?url=https://github.com/facebook/react")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"


def test_cold_forge_link_points_og_image_at_the_generated_card(client):
    r = client.get("/c/facebook/react")
    assert "/og-card?url=" in r.text                           # no warmed capture yet → generated card


def test_warm_capture_beats_the_generated_card(client, monkeypatch):
    monkeypatch.setattr(forge_mod, "og_exists", lambda key: True)
    r = client.get("/c/facebook/react")
    assert "/og/" in r.text
    assert "/og-card" not in r.text                            # a real captured skyline wins when present


# ---- #4 player card (gated) + embed page -------------------------------------

def test_default_is_the_reliable_image_card(client):
    r = client.get("/c/facebook/react")
    assert 'name="twitter:card" content="summary_large_image"' in r.text
    assert "twitter:player" not in r.text                      # no regression on the common path


def test_player_card_activates_only_behind_the_flag(client, monkeypatch):
    monkeypatch.setattr(server, "PLAYER_CARD", "1")
    r = client.get("/c/facebook/react")
    assert 'name="twitter:card" content="player"' in r.text
    assert 'name="twitter:player" content="http://testserver/player/facebook/react"' in r.text


def test_embed_page_is_a_chromeless_movie(client):
    r = client.get("/player/facebook/react")
    assert 'data-embed="1"' in r.text
    assert "city-timelapse.js" in r.text


def test_embed_page_never_advertises_a_player_card(client, monkeypatch):
    monkeypatch.setattr(server, "PLAYER_CARD", "1")            # even with the flag on
    r = client.get("/player/facebook/react")
    assert 'content="player"' not in r.text                   # else the iframe would nest itself


# ---- og:video inline-play card (Discord / iMessage / Telegram / Slack) -------

def test_default_has_no_og_video(client):
    r = client.get("/c/facebook/react")
    assert "og:video" not in r.text                           # no warmed clip → still-image card only


def test_warmed_clip_advertises_inline_og_video(client, monkeypatch):
    monkeypatch.setattr(forge_mod, "ogv_exists", lambda key: True)
    h = forge_mod.og_hash("https://github.com/facebook/react")
    r = client.get("/c/facebook/react")
    assert f'property="og:video" content="http://testserver/og-video/{h}.mp4"' in r.text
    assert 'property="og:video:type" content="video/mp4"' in r.text


def test_og_video_upload_is_graceful_without_ffmpeg(client, monkeypatch):
    monkeypatch.setattr(server, "FFMPEG", None)               # CLI install: no transcoder → no video card, image card stands
    r = client.post("/og-video?key=x", content=b"\x00\x00\x00\x18ftypwebm",
                    headers={"Content-Type": "video/webm"})
    assert r.status_code == 503


def test_og_video_route_rejects_path_traversal(client):
    assert client.get("/og-video/not-a-hash.mp4").status_code == 404
