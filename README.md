# 📀 Retrospin

A horizontal timeline of rock records, from Elvis Presley's first LP (1956) to today. Live at
[retrospin.vumble.dev](https://retrospin.vumble.dev). Scroll, drag or use the
arrow keys to travel through the years. The covers turn as they pass, Cover Flow style. Click a record to read a
short note about it and play it with the Spotify player.

You can filter by scene, by the band's country, by name, and, once you connect Spotify, show only the artists from
your liked songs.

## Run it

```bash
npm install
npm run dev
```

The dev server runs on http://127.0.0.1:5190 (Spotify does not accept `localhost` as a login address).

## Connect Spotify

The "Connect Spotify" button logs you in with Spotify in the browser (authorization code flow with PKCE: no server,
no secret). The page then reads your liked songs and puts a heart on the albums by artists you like. A number on
the heart counts your liked songs on that record. The login and the liked songs stay in your browser.

To enable it:

1. Create an app on the [Spotify developer dashboard](https://developer.spotify.com/dashboard), with the Web API.
2. Add the redirect URIs `http://127.0.0.1:5190/` and the address where you deploy the site, with the trailing
   slash.
3. Copy `.env.example` to `.env.local` and set `VITE_SPOTIFY_CLIENT_ID` to the app's client ID.

Spotify apps in development mode only accept the owner and the users added in the dashboard's "User Management".

## Keyboard

| Key | Action |
| --- | --- |
| Left / Right | Move along the timeline, or to the previous / next album when one is open |
| Page Up / Page Down | Move by a screen |
| Home / End | Jump to the start / end |
| / | Search |
| Esc | Close the album |

## Data

The app reads `src/data/albums.json`, which holds public data only. It is built from:

- `scripts/catalog.txt`: the hand-picked albums, one per line as `year | artist | title | scene | note`. Optional
  extra columns: `q:<text>` changes the Spotify search, `id:<album id>` picks an exact Spotify album, `c:<XX>` sets
  the country.
- Spotify, with app access only (no user login): each album's cover, link, artists and song list.
- [MusicBrainz](https://musicbrainz.org) for each band's country, since Spotify does not have it.

To rebuild it after editing the catalog (Python 3, standard library only):

```bash
SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... npm run data
```

or set `SPOTIFY_ENV_FILE` to a file holding those two lines. It prints the albums it could not match, the
albums whose Spotify edition is a later reissue, and the country found for each band. Answers are cached in
`scripts/.cache/`.

Scenes (the colors) are defined in `src/scenes.ts`, the era bands at the top in `src/eras.ts`.
