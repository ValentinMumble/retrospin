#!/usr/bin/env python3
"""Store Last.fm's tags on every album in Redis, for the genre explorer.

    python3 scripts/build_tags.py [--refresh]

Reads the albums from Redis (KV_REST_API_URL and KV_REST_API_TOKEN, from the environment or .env.local) and
LASTFM_API_KEY (environment, or LASTFM_ENV_FILE / SPOTIFY_ENV_FILE). Each album gets `tags`: the album's and
its artist's top tags, album tags counting double, as [tag, weight] pairs, heaviest first. The same mix as
`mergeTags` in api/_lib/scene.ts, which tags albums added through the site. Albums that already have tags are
skipped unless --refresh is given. Last.fm answers are cached in scripts/.cache/lastfm.json, so running it
again after `npm run data` (which rewrites the catalog albums without tags) is quick.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_data import load, save  # noqa: E402
from seed_redis import ALBUMS, pipeline, settings  # noqa: E402
from suggest_albums import LASTFM_CACHE, api_key, lastfm  # noqa: E402

TAGS_PER_SOURCE = 15
TAGS_KEPT = 12


def top_tags(params, cache, key):
    answer = lastfm({**params, "autocorrect": "1"}, cache, key)
    tags = (answer.get("toptags") or {}).get("tag", [])
    return [(tag["name"].strip().lower(), int(tag.get("count") or 0)) for tag in tags[:TAGS_PER_SOURCE]]


def album_tags(artist, title, cache, key):
    # "Neil Young & Crazy Horse", "The Velvet Underground & Nico": fall back to the first name.
    names = [artist, artist.split(" & ")[0]] if " & " in artist else [artist]
    album, artist_only = [], []
    for name in names:
        album = album or top_tags({"method": "album.gettoptags", "artist": name, "album": title}, cache, key)
        artist_only = artist_only or top_tags({"method": "artist.gettoptags", "artist": name}, cache, key)
    weights = {}
    for tags, factor in ((album, 2), (artist_only, 1)):
        for name, count in tags:
            if name:
                weights[name] = weights.get(name, 0) + max(count, 1) * factor
    ranked = sorted(weights.items(), key=lambda item: (-item[1], item[0]))
    return [[name, weight] for name, weight in ranked[:TAGS_KEPT]]


def main():
    url, token = settings()
    key = api_key()
    [raw] = pipeline(url, token, [["HVALS", ALBUMS]])
    albums = [json.loads(album) for album in raw]
    todo = albums if "--refresh" in sys.argv else [album for album in albums if not album.get("tags")]
    print(f"{len(albums)} albums, {len(todo)} to tag")
    cache = load(LASTFM_CACHE)
    commands, empty = [], []
    try:
        for number, album in enumerate(todo, start=1):
            album["tags"] = album_tags(album["artist"], album["title"], cache, key)
            if not album["tags"]:
                empty.append(f"{album['artist']} - {album['title']}")
            commands.append(["HSET", ALBUMS, album["id"], json.dumps(album, ensure_ascii=False)])
            if len(commands) == 25 or number == len(todo):
                pipeline(url, token, commands)
                commands = []
                print(f"  {number}/{len(todo)}", flush=True)
    finally:
        save(LASTFM_CACHE, cache)
    print(f"stored; no tags for {len(empty)}: {', '.join(empty) or '-'}")


if __name__ == "__main__":
    sys.exit(main())
