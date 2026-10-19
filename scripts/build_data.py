#!/usr/bin/env python3
"""Build src/data/albums.json from scripts/catalog.txt: Spotify covers, links and song lists, plus MusicBrainz
countries. Standard library only:

    SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... python3 scripts/build_data.py

SPOTIFY_ENV_FILE can instead point at a KEY=VALUE file holding those two. The script reads public data only
(app access, no user login). Liked songs are loaded later, in the browser, by whoever connects Spotify on the
page. Answers are cached in scripts/.cache/ so re-runs are fast: delete that folder to fetch everything again.

The country of an album is the country of its first artist, from MusicBrainz: through the link MusicBrainz keeps
to the artist's Spotify page, else by searching the name. A "c:XX" column in the catalog overrides it.
"""
import base64
import json
import os
import re
import sys
import time
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
CATALOG = HERE / "catalog.txt"
CACHE = HERE / ".cache" / "spotify.json"
MB_CACHE = HERE / ".cache" / "musicbrainz.json"
# The seed for Redis: scripts/seed_redis.py loads it into the album store.
OUTPUT = HERE / ".cache" / "albums.json"
MB_AGENT = "retrospin/0.1 (https://vumble.dev)"
SCENES = {"rnr", "pop", "roots", "psych", "art", "prog", "hard", "soft", "punk", "postpunk", "newwave", "alt",
          "dream", "britpop", "indie"}
EXTRA_WORDS = re.compile(r"remaster|deluxe|edition|anniversary|expanded|version|mono|stereo|bonus|legacy|"
                         r"collector|super|reissue|definitive|feat\.|with ", re.IGNORECASE)
SUFFIX = re.compile(r"\s+-\s+.*\b(remaster\w*|edition|version|anniversary|mono|stereo|live|mix|edit)\b.*$",
                    re.IGNORECASE)
BAD_WORDS = re.compile(r"karaoke|tribute|cover|in the style of|made famous|\bdemos?\b", re.IGNORECASE)


def credentials():
    client_id = os.environ.get("SPOTIFY_CLIENT_ID")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
    env_file = os.environ.get("SPOTIFY_ENV_FILE")
    if (not client_id or not client_secret) and env_file:
        for line in Path(env_file).expanduser().read_text().splitlines():
            key, _, value = line.partition("=")
            if key == "SPOTIFY_CLIENT_ID":
                client_id = value.strip()
            elif key == "SPOTIFY_CLIENT_SECRET":
                client_secret = value.strip()
    if not client_id or not client_secret:
        raise SystemExit("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET, or SPOTIFY_ENV_FILE")
    return client_id, client_secret


class SpotifyApp:
    """App-only Spotify access (client credentials flow): search and album details, never user data."""

    def __init__(self):
        self.client_id, self.client_secret = credentials()
        self.token, self.expires = None, 0.0

    def access_token(self):
        if self.token and time.time() < self.expires:
            return self.token
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        request = Request("https://accounts.spotify.com/api/token",
                          data=urlencode({"grant_type": "client_credentials"}).encode(),
                          headers={"Authorization": f"Basic {basic}",
                                   "Content-Type": "application/x-www-form-urlencoded"})
        with urlopen(request, timeout=30) as response:
            answer = json.load(response)
        self.token, self.expires = answer["access_token"], time.time() + answer["expires_in"] - 60
        return self.token

    def get(self, path_or_url, params=None):
        url = path_or_url if path_or_url.startswith("https://") else f"https://api.spotify.com/v1/{path_or_url}"
        if params:
            url += f"?{urlencode(params)}"
        for attempt in range(6):
            try:
                request = Request(url, headers={"Authorization": f"Bearer {self.access_token()}"})
                with urlopen(request, timeout=30) as response:
                    return json.load(response)
            except HTTPError as error:
                if error.code == 429:
                    time.sleep(int(error.headers.get("Retry-After", "2")) + 1)
                elif error.code >= 500:
                    time.sleep(2 * (attempt + 1))
                else:
                    raise
        raise SystemExit(f"Spotify kept failing for {url}")


def tidy(name):
    """A song or album name without remaster, edition and featuring tags."""
    name = re.sub(r"\s*[(\[][^)\]]*[)\]]", lambda match: "" if EXTRA_WORDS.search(match.group()) else match.group(),
                  name)
    name = SUFFIX.sub("", name)
    return re.sub(r"\s+(\d+(st|nd|rd|th)\s+)?(anniversary|deluxe|expanded|remastered)\b.*$", "", name,
                  flags=re.IGNORECASE).strip()


def normalize(text):
    """Comparable form of a name: tidied, no accents, no punctuation, no leading 'the'."""
    text = unicodedata.normalize("NFKD", tidy(text)).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", " ", text.lower().replace("&", " and ")).strip()
    return re.sub(r"^the ", "", text)


def read_catalog():
    entries = []
    for number, line in enumerate(CATALOG.read_text().splitlines(), start=1):
        if not line.strip() or line.startswith("#"):
            continue
        fields = [field.strip() for field in line.split(" | ")]
        if len(fields) < 5 or fields[3] not in SCENES:
            raise SystemExit(f"catalog.txt line {number}: bad line: {line}")
        year, artist, title, scene, note = fields[:5]
        options = dict(field.split(":", 1) for field in fields[5:])
        entries.append({"year": int(year), "artist": artist, "title": title, "scene": scene, "note": note,
                        "query": options.get("q"), "album_id": options.get("id"), "country": options.get("c")})
    return sorted(entries, key=lambda entry: entry["year"])


def cached(cache, key, fetch):
    if key not in cache:
        cache[key] = fetch()
    return cache[key]


def candidate_summary(album):
    return {"id": album["id"], "name": album["name"], "type": album.get("album_type"),
            "release": album.get("release_date", ""), "artists": [artist["name"] for artist in album["artists"]]}


def title_points(title, name):
    if name == title:
        return 100
    shorter, longer = sorted((title, name), key=len)
    if len(shorter) < 0.5 * len(longer):
        return 0
    if longer.startswith(shorter):
        return 60
    return 40 if shorter in longer else 0


def score(candidate, entry):
    points = title_points(normalize(entry["title"]), normalize(candidate["name"]))
    if {normalize(artist) for artist in candidate["artists"]} & {normalize(entry["artist"])}:
        points += 50
    points += {"album": 10, "compilation": -20}.get(candidate["type"], 0)
    live = re.compile(r"\blive\b", re.IGNORECASE)
    if live.search(candidate["name"]) and not live.search(entry["title"]):
        points -= 40
    if BAD_WORDS.search(candidate["name"]):
        points -= 200
    if candidate["release"][:4] == str(entry["year"]):
        points += 15
    return points


def search(spotify, entry, cache):
    """The id of the best matching Spotify album, or None."""
    clean = lambda text: re.sub(r"[\"':&]", " ", text)
    queries = [entry["query"]] if entry["query"] else []
    queries += [f'album:{clean(entry["title"])} artist:{clean(entry["artist"])}',
                f'{clean(entry["title"])} {clean(entry["artist"])}']
    best, best_points = None, 0
    for query in queries:
        items = cached(cache, f"search:{query}",
                       lambda: spotify.get("search", {"q": query, "type": "album", "limit": 10})["albums"]["items"])
        for item in filter(None, items):
            points = score(candidate_summary(item), entry)
            if points > best_points:
                best, best_points = item["id"], points
        if best_points >= 160:
            break
    return best if best_points >= 110 else None


def album_details(spotify, album_id, cache):
    """The album's public details, with the names of all its songs."""
    album = cached(cache, f"album:{album_id}", lambda: spotify.get(f"albums/{album_id}"))

    def all_tracks():
        page, names = album["tracks"], []
        while page:
            names += [track["name"] for track in page["items"]]
            page = spotify.get(page["next"]) if page.get("next") else None
        return names

    images = sorted(album.get("images") or [], key=lambda image: image.get("width") or 0, reverse=True)
    return {
        "id": album["id"],
        "url": album["external_urls"]["spotify"],
        "name": album["name"],
        "cover": images[0]["url"] if images else None,
        "coverSmall": (images[1] if len(images) > 1 else images[0])["url"] if images else None,
        "artists": [artist["name"] for artist in album["artists"]],
        "artistIds": [artist["id"] for artist in album["artists"]],
        "tracks": cached(cache, f"tracks:{album_id}", all_tracks),
        "release": album.get("release_date", ""),
        "precision": album.get("release_date_precision", "year"),
    }


def musicbrainz(path, params, cache):
    """GET a MusicBrainz web service path, cached, at most one request per second as MusicBrainz asks."""
    url = f"https://musicbrainz.org/ws/2/{path}?{urlencode({**params, 'fmt': 'json'})}"
    if url in cache:
        return cache[url]
    for attempt in range(4):
        time.sleep(1.1 + attempt * 2)
        try:
            with urlopen(Request(url, headers={"User-Agent": MB_AGENT, "Accept": "application/json"}),
                         timeout=30) as response:
                cache[url] = json.load(response)
                return cache[url]
        except HTTPError as error:
            if error.code == 404:
                cache[url] = None
                return None
            if error.code != 503:
                raise
    raise SystemExit(f"MusicBrainz kept answering 503 for {url}")


def artist_country(artist):
    country = artist.get("country")
    if not country:
        codes = (artist.get("area") or {}).get("iso-3166-1-codes") or []
        country = codes[0] if codes else None
    return country


def find_country(name, spotify_id, cache):
    """(country code or None, how it was found) for an artist."""
    if spotify_id:
        found = musicbrainz("url", {"resource": f"https://open.spotify.com/artist/{spotify_id}",
                                    "inc": "artist-rels"}, cache)
        for relation in (found or {}).get("relations", []):
            if relation.get("artist"):
                artist = musicbrainz(f'artist/{relation["artist"]["id"]}', {}, cache)
                if artist and artist_country(artist):
                    return artist_country(artist), "spotify link"
    escaped = re.sub(r'(["\\])', r"\\\1", name)
    results = musicbrainz("artist", {"query": f'artist:"{escaped}"', "limit": 5}, cache) or {}
    for artist in results.get("artists", []):
        if artist.get("score", 0) >= 90 and normalize(artist["name"]) == normalize(name) and artist_country(artist):
            return artist_country(artist), "name search"
    return None, "not found"


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", normalize(text)).strip("-")


def load(path):
    return json.loads(path.read_text()) if path.exists() else {}


def save(path, value):
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False))


def main():
    spotify = SpotifyApp()
    entries = read_catalog()
    cache = load(CACHE)
    try:
        for entry in entries:
            album_id = entry["album_id"] or search(spotify, entry, cache)
            entry["spotify"] = album_details(spotify, album_id, cache) if album_id else None
    finally:
        save(CACHE, cache)

    mb_cache = load(MB_CACHE)
    countries = {}
    try:
        for entry in entries:
            spotify_album = entry["spotify"]
            name = spotify_album["artists"][0] if spotify_album else entry["artist"]
            if entry["country"]:
                countries[name] = (entry["country"], "catalog")
            elif name not in countries:
                countries[name] = find_country(name, spotify_album["artistIds"][0] if spotify_album else None,
                                               mb_cache)
            entry["country_code"] = entry["country"] or countries[name][0]
    finally:
        save(MB_CACHE, mb_cache)

    albums = []
    for entry in entries:
        spotify_album = entry["spotify"]
        exact = spotify_album and spotify_album["release"][:4] == str(entry["year"]) \
            and spotify_album["precision"] == "day"
        albums.append({
            "id": slug(f'{entry["artist"]} {entry["title"]}'),
            "year": entry["year"],
            "date": spotify_album["release"] if exact else str(entry["year"]),
            "artist": entry["artist"],
            "title": entry["title"],
            "scene": entry["scene"],
            "country": entry["country_code"],
            "note": entry["note"],
            "spotify": {key: spotify_album[key] for key in
                        ("id", "url", "name", "cover", "coverSmall", "artistIds", "tracks")} if spotify_album else None,
        })
    albums.sort(key=lambda album: (album["date"], album["artist"]))
    duplicates = [key for key, count in Counter(album["id"] for album in albums).items() if count > 1]
    assert not duplicates, duplicates
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"generatedAt": date.today().isoformat(), "albums": albums},
                                 ensure_ascii=False, separators=(",", ":")) + "\n")

    print(f"wrote {OUTPUT.relative_to(HERE.parent)}: {len(albums)} albums, "
          f"{len({album['country'] for album in albums if album['country']})} countries")
    for entry in entries:
        if not entry["spotify"]:
            print(f'  no Spotify match: {entry["year"]} {entry["artist"]} - {entry["title"]}')
        elif entry["spotify"]["release"][:4] != str(entry["year"]):
            print(f'  year differs: {entry["year"]} {entry["artist"]} - {entry["title"]}  ->  '
                  f'{entry["spotify"]["release"]} {entry["spotify"]["name"]}')
    for name, (country, source) in sorted(countries.items(), key=lambda item: (item[1][0] or "", item[0])):
        print(f"  country: {country or '??'}  {name}  ({source})")


if __name__ == "__main__":
    sys.exit(main())
