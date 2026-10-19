#!/usr/bin/env python3
"""Load the albums built by scripts/build_data.py into the Redis album store. Standard library only:

    python3 scripts/seed_redis.py [--env-file .env.local]

Reads KV_REST_API_URL and KV_REST_API_TOKEN (Upstash REST) from the environment or from the env file, which
`vercel env pull .env.local` fills once the store is connected. Catalog albums are added or updated. Albums
that left catalog.txt are removed. Albums that came in through suggestions are left alone.
"""
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
ALBUMS_FILE = HERE / ".cache" / "albums.json"
ALBUMS = "retrospin:albums"
SPOTIFY_IDS = "retrospin:spotify-ids"
CATALOG_IDS = "retrospin:catalog-ids"


def settings():
    values = {name: os.environ.get(name) for name in ("KV_REST_API_URL", "KV_REST_API_TOKEN")}
    env_file = Path(sys.argv[sys.argv.index("--env-file") + 1] if "--env-file" in sys.argv else ".env.local")
    if not all(values.values()) and env_file.exists():
        for line in env_file.read_text().splitlines():
            name, _, value = line.partition("=")
            if name in values and not values[name]:
                values[name] = value.strip().strip('"')
    if not all(values.values()):
        raise SystemExit("Set KV_REST_API_URL and KV_REST_API_TOKEN, or run `vercel env pull .env.local` first")
    return values["KV_REST_API_URL"].rstrip("/"), values["KV_REST_API_TOKEN"]


def pipeline(url, token, commands):
    """Runs Redis commands through Upstash's REST pipeline and returns their results."""
    request = Request(f"{url}/pipeline", data=json.dumps(commands).encode(),
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urlopen(request, timeout=60) as response:
        answers = json.load(response)
    errors = [answer["error"] for answer in answers if "error" in answer]
    if errors:
        raise SystemExit(f"Redis refused: {errors[0]}")
    return [answer.get("result") for answer in answers]


def main():
    url, token = settings()
    albums = json.loads(ALBUMS_FILE.read_text())["albums"]
    ids = {album["id"] for album in albums}
    [previous] = pipeline(url, token, [["SMEMBERS", CATALOG_IDS]])
    gone = sorted(set(previous or []) - ids)
    commands = []
    for album_id in gone:
        commands.append(["HDEL", ALBUMS, album_id])
    for start in range(0, len(albums), 50):
        batch = albums[start:start + 50]
        commands.append(["HSET", ALBUMS, *[part for album in batch for part in (album["id"], json.dumps(album, ensure_ascii=False))]])
    spotify_ids = [album["spotify"]["id"] for album in albums if album["spotify"]]
    commands.append(["SADD", SPOTIFY_IDS, *spotify_ids])
    commands.append(["DEL", CATALOG_IDS])
    commands.append(["SADD", CATALOG_IDS, *sorted(ids)])
    pipeline(url, token, commands)
    [total] = pipeline(url, token, [["HLEN", ALBUMS]])
    print(f"seeded {len(albums)} catalog albums, removed {len(gone)}; the store now holds {total} albums")


if __name__ == "__main__":
    sys.exit(main())
