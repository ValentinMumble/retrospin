#!/usr/bin/env python3
"""Store Last.fm's similar artists of every artist on the timeline in Redis, for the galaxy links.

    python3 scripts/build_similar.py [--refresh]

Reads the albums from Redis (KV_REST_API_URL and KV_REST_API_TOKEN, from the environment or .env.local) and
LASTFM_API_KEY (environment, or LASTFM_ENV_FILE / SPOTIFY_ENV_FILE). Artists already stored are skipped unless
--refresh is given. Albums added later through the site store their artist themselves. Last.fm answers are
cached in scripts/.cache/lastfm.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_data import load, save  # noqa: E402
from seed_redis import ALBUMS, pipeline, settings  # noqa: E402
from suggest_albums import LASTFM_CACHE, api_key, lastfm  # noqa: E402

SIMILAR = "retrospin:similar"


def similar(artist, cache, key):
    answer = lastfm({"method": "artist.getsimilar", "artist": artist, "limit": "100", "autocorrect": "1"}, cache, key)
    return [[item["name"], float(item.get("match") or 0)] for item in (answer.get("similarartists") or {}).get("artist", [])]


def main():
    url, token = settings()
    key = api_key()
    [raw_albums, known] = pipeline(url, token, [["HVALS", ALBUMS], ["HKEYS", SIMILAR]])
    artists = sorted({json.loads(album)["artist"] for album in raw_albums})
    todo = artists if "--refresh" in sys.argv else [artist for artist in artists if artist not in set(known or [])]
    print(f"{len(artists)} artists on the timeline, {len(todo)} to fetch")
    cache = load(LASTFM_CACHE)
    commands, empty = [], []
    try:
        for number, artist in enumerate(todo, start=1):
            found = similar(artist, cache, key)
            # "Neil Young & Crazy Horse", "The Velvet Underground & Nico": fall back to the first name.
            if not found and " & " in artist:
                found = similar(artist.split(" & ")[0], cache, key)
            if not found:
                empty.append(artist)
            commands.append(["HSET", SIMILAR, artist, json.dumps(found, ensure_ascii=False)])
            if len(commands) == 25 or number == len(todo):
                pipeline(url, token, commands)
                commands = []
                print(f"  {number}/{len(todo)}", flush=True)
    finally:
        save(LASTFM_CACHE, cache)
    print(f"stored; no similar artists for {len(empty)}: {', '.join(empty) or '-'}")


if __name__ == "__main__":
    sys.exit(main())
