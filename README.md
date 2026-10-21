# 📀 Retrospin

A horizontal timeline of rock records, from Elvis Presley's first LP (1956) to today. Live at
[retrospin.vumble.dev](https://retrospin.vumble.dev). Scroll, drag or use the
arrow keys to travel through the years. The covers turn as they pass, Cover Flow style. Click a record to read a
short note about it and play it with the Spotify player.

You can filter by scene, by the band's country, by name, and, once you connect Spotify, show only the artists from
your liked songs. The Galaxy view links similar records, and the Genres view ranks the genres with the most records
(or the most liked ones) and explores one: its records, the genres around it, and its popular albums that are not on
the timeline yet.

## How it works

- The albums live in a Redis store (Upstash, connected to the Vercel project). The page loads them from
  `GET /api/albums`, which the CDN caches for five minutes.
- Anyone can suggest an album: search Spotify, pick the record, add an optional note. The server fetches the cover,
  links and songs from Spotify, the band's country from [MusicBrainz](https://musicbrainz.org), and the tags from
  [Last.fm](https://www.last.fm), which give the scene and the genres. Suggestions wait for review.
- The site owner (the Spotify account in `ADMIN_SPOTIFY_USER_ID`) sees a Review button to approve or reject them,
  and can correct the scene or year. The owner's own suggestions go live at once.
- "Connect Spotify" logs in from the browser (authorization code flow with PKCE, no server, no secret) and marks
  the albums by artists from your liked songs. The login and the liked songs stay in your browser.

## Run it

```bash
npm install
npm start
```

`npm start` runs `vercel dev` on http://127.0.0.1:5190, with the API (Spotify does not accept `localhost` as a
login address). It needs the Vercel project linked (`vercel link`) and its variables pulled
(`vercel env pull .env.local`). `npm run dev` runs Vite alone, without the API, so no albums load.

## Environment variables

| Name | Used by | What |
| --- | --- | --- |
| `VITE_SPOTIFY_CLIENT_ID` | page | Spotify app client ID, for the login button |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | API, data scripts | Spotify app access for search and album details |
| `LASTFM_API_KEY` | API, data scripts | Last.fm tags (scene and genres), similar artists, top albums |
| `ADMIN_SPOTIFY_USER_ID` | API | Spotify user id of the site owner, who reviews suggestions |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | API, seed script | Added by Vercel when the Upstash Redis store is connected |

For the login, add `http://127.0.0.1:5190/` and the deployed address (with the trailing slash) to the Spotify app's
Redirect URIs. Spotify apps in development mode only accept the owner and the users added in "User Management".

## Keyboard

| Key | Action |
| --- | --- |
| Left / Right | Move along the timeline, or to the previous / next album when one is open |
| Page Up / Page Down | Move by a screen |
| Home / End | Jump to the start / end |
| / | Search |
| Esc | Close the album, or turn the lights back on |

## The hand-picked catalog

`scripts/catalog.txt` holds the hand-picked albums, one per line as `year | artist | title | scene | note`. Optional
extra columns: `q:<text>` changes the Spotify search, `id:<album id>` picks an exact Spotify album, `c:<XX>` sets the
country. To load it into Redis (Python 3, standard library only):

```bash
SPOTIFY_ENV_FILE=<file with SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET> npm run data
```

`scripts/build_data.py` fetches each album from Spotify and MusicBrainz (answers cached in `scripts/.cache/`), then
`scripts/seed_redis.py` adds or updates the catalog albums in Redis and removes the ones that left the catalog.
Albums that came in through suggestions are left alone. Last, `scripts/build_tags.py` gives every album without tags
its Last.fm tags (the env file must also hold `LASTFM_API_KEY`). `scripts/suggest_albums.py` lists popular albums
missing from the catalog, scene by scene, from Last.fm listeners.

Which tags count as genres (and which spellings are the same genre) is decided in the page, in `src/genres.ts`, so
it changes without touching the data.

Scenes (the colors) are defined in `src/scenes.ts`, the era bands in `src/eras.ts`, the themes in `src/themes.ts`.
