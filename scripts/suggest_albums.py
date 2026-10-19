#!/usr/bin/env python3
"""Suggest popular albums missing from scripts/catalog.txt, scene by scene, from Last.fm listeners.

    LASTFM_API_KEY=... python3 scripts/suggest_albums.py [albums per scene, default 12]

SPOTIFY_ENV_FILE (or LASTFM_ENV_FILE) can instead point at a KEY=VALUE file holding LASTFM_API_KEY. For each
scene it reads Last.fm's top albums for a few tags, drops best-ofs, live albums and albums already in the
catalog, ranks the rest by Last.fm listeners and finds the original release year on MusicBrainz. The result is
written to scripts/.cache/suggestions.txt as ready-to-edit catalog lines: pick the ones you want, write a note,
paste them into catalog.txt and run `npm run data`.
"""
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_data import MB_CACHE, load, musicbrainz, normalize, read_catalog, save  # noqa: E402

LASTFM_CACHE = HERE / ".cache" / "lastfm.json"
OUTPUT = HERE / ".cache" / "suggestions.txt"
SCENE_TAGS = {
    "rnr": ["rock n roll", "rockabilly"],
    "pop": ["british invasion", "60s", "merseybeat"],
    "roots": ["folk rock", "country rock", "americana"],
    "psych": ["psychedelic rock", "psychedelic"],
    "art": ["glam rock", "art rock"],
    "prog": ["progressive rock", "krautrock"],
    "hard": ["hard rock", "heavy metal", "classic rock"],
    "soft": ["soft rock", "aor"],
    "punk": ["punk rock", "proto-punk", "hardcore punk"],
    "postpunk": ["post-punk", "gothic rock", "dance-punk"],
    "newwave": ["new wave", "synthpop"],
    "alt": ["alternative rock", "grunge", "college rock"],
    "dream": ["shoegaze", "dream pop"],
    "britpop": ["britpop"],
    "indie": ["indie rock", "garage rock revival", "lo-fi"],
}
NOT_AN_ALBUM = re.compile(r"best of|greatest|hits|collection|anthology|\blive\b|essential|singles|definitive|"
                          r"gold|the very|platinum|unplugged|soundtrack|b-sides|rarities|demos|sessions|remix",
                          re.IGNORECASE)


def api_key():
    key = os.environ.get("LASTFM_API_KEY")
    env_file = os.environ.get("LASTFM_ENV_FILE") or os.environ.get("SPOTIFY_ENV_FILE")
    if not key and env_file:
        for line in Path(env_file).expanduser().read_text().splitlines():
            name, _, value = line.partition("=")
            if name == "LASTFM_API_KEY":
                key = value.strip()
    if not key:
        raise SystemExit("Set LASTFM_API_KEY, or LASTFM_ENV_FILE to a file that holds it")
    return key


def lastfm(params, cache, key):
    """GET the Last.fm API, cached, at most about four requests per second."""
    cache_key = urlencode(sorted(params.items()))
    if cache_key in cache:
        return cache[cache_key]
    url = f"https://ws.audioscrobbler.com/2.0/?{urlencode({**params, 'api_key': key, 'format': 'json'})}"
    for attempt in range(4):
        time.sleep(0.25 + attempt * 2)
        try:
            with urlopen(Request(url, headers={"User-Agent": "retrospin/0.1"}), timeout=30) as response:
                answer = json.load(response)
        except HTTPError as error:
            if error.code >= 500 or error.code == 429:
                continue
            answer = json.load(error)
        if answer.get("error") in (11, 16, 29):  # service offline, temporary error, rate limit
            continue
        cache[cache_key] = answer
        return answer
    raise SystemExit(f"Last.fm kept failing for {params}")


def original_release(artist, title, mb_cache):
    """(year, kind) of the album's release group on MusicBrainz; kind is 'album', 'other' or 'unknown'."""
    clean = lambda text: re.sub(r'(["\\])', r"\\\1", text)
    answer = musicbrainz("release-group", {"query": f'releasegroup:"{clean(title)}" AND artist:"{clean(artist)}"',
                                           "limit": 5}, mb_cache) or {}
    for group in answer.get("release-groups", []):
        if group.get("score", 0) < 85 or normalize(group["title"]) != normalize(title):
            continue
        year = (group.get("first-release-date") or "")[:4]
        studio = group.get("primary-type") == "Album" and not group.get("secondary-types")
        return (int(year) if year.isdigit() else None), ("album" if studio else "other")
    return None, "unknown"


def main():
    per_scene = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    key = api_key()
    catalog = read_catalog()
    known = {(normalize(entry["artist"]), normalize(entry["title"])) for entry in catalog}
    lastfm_cache, mb_cache = load(LASTFM_CACHE), load(MB_CACHE)
    taken = set(known)
    lines = []
    try:
        for scene, tags in SCENE_TAGS.items():
            ranked = []
            for tag in tags:
                answer = lastfm({"method": "tag.gettopalbums", "tag": tag, "limit": 60}, lastfm_cache, key)
                ranked.append(answer.get("albums", {}).get("album", []))
            # Interleave the tags by rank, then keep the first unseen real albums.
            candidates = []
            for position in range(max(map(len, ranked), default=0)):
                for albums in ranked:
                    if position >= len(albums):
                        continue
                    album = albums[position]
                    artist, title = album["artist"]["name"], album["name"]
                    pair = (normalize(artist), normalize(title))
                    if pair in taken or NOT_AN_ALBUM.search(title) or not pair[1]:
                        continue
                    taken.add(pair)
                    candidates.append((artist, title))
            candidates = candidates[: per_scene * 3]
            scored = []
            for artist, title in candidates:
                info = lastfm({"method": "album.getinfo", "artist": artist, "album": title}, lastfm_cache, key)
                listeners = int((info.get("album") or {}).get("listeners") or 0)
                scored.append((listeners, artist, title))
            scored.sort(reverse=True)
            kept = 0
            for listeners, artist, title in scored:
                year, kind = original_release(artist, title, mb_cache)
                if kind == "other" or (year and not 1954 <= year <= 2026):
                    continue
                lines.append(f"{year or '????'} | {artist} | {title} | {scene} | TODO  # {listeners:,} listeners")
                kept += 1
                if kept == per_scene:
                    break
            print(f"{scene}: {kept} suggestions", flush=True)
    finally:
        save(LASTFM_CACHE, lastfm_cache)
        save(MB_CACHE, mb_cache)
    OUTPUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUTPUT.relative_to(HERE.parent)} ({len(lines)} lines)")


if __name__ == "__main__":
    sys.exit(main())
