import {env, HttpError} from './http.js';

/** App-only Spotify access (client credentials): public catalog data, never user data. */

let appToken: {value: string; expiresAt: number} | null = null;

async function accessToken() {
  if (appToken && Date.now() < appToken.expiresAt) return appToken.value;
  const basic = Buffer.from(`${env('SPOTIFY_CLIENT_ID')}:${env('SPOTIFY_CLIENT_SECRET')}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new HttpError(502, 'Spotify refused the app login');
  const data = (await response.json()) as {access_token: string; expires_in: number};
  appToken = {value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000};
  return appToken.value;
}

async function get<T>(pathOrUrl: string, token?: string): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `https://api.spotify.com/v1/${pathOrUrl}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {headers: {Authorization: `Bearer ${token ?? (await accessToken())}`}});
    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, Number(response.headers.get('Retry-After') ?? '1') * 1000));
      continue;
    }
    if (response.status === 404) throw new HttpError(404, 'Spotify does not know this album');
    if (response.status === 401 && token) throw new HttpError(401, 'Your Spotify session ended, connect again');
    if (!response.ok) throw new HttpError(502, `Spotify answered ${response.status}`);
    return (await response.json()) as T;
  }
  throw new HttpError(503, 'Spotify is busy, try again in a minute');
}

interface SpotifyImage {
  url: string;
  width: number | null;
}

interface SpotifyAlbum {
  id: string;
  name: string;
  album_type: string;
  release_date: string;
  release_date_precision: string;
  images: SpotifyImage[];
  artists: {id: string; name: string}[];
  external_urls: {spotify: string};
  tracks?: {items: {name: string}[]; next: string | null};
}

function images(album: SpotifyAlbum) {
  const sorted = [...album.images].sort((first, second) => (second.width ?? 0) - (first.width ?? 0));
  return {cover: sorted[0]?.url ?? null, coverSmall: (sorted[1] ?? sorted[0])?.url ?? null};
}

export interface Candidate {
  spotifyId: string;
  title: string;
  artist: string;
  year: number | null;
  type: string;
  cover: string | null;
}

export async function searchAlbums(query: string): Promise<Candidate[]> {
  const params = new URLSearchParams({q: query, type: 'album', limit: '10'});
  const answer = await get<{albums: {items: (SpotifyAlbum | null)[]}}>(`search?${params}`);
  return answer.albums.items
    .filter((album): album is SpotifyAlbum => album !== null)
    .map(album => ({
      spotifyId: album.id,
      title: album.name,
      artist: album.artists.map(artist => artist.name).join(', '),
      year: Number(album.release_date.slice(0, 4)) || null,
      type: album.album_type,
      cover: images(album).coverSmall,
    }));
}

export interface AlbumDetails {
  id: string;
  url: string;
  name: string;
  cover: string | null;
  coverSmall: string | null;
  artists: string[];
  artistIds: string[];
  tracks: string[];
  release: string;
  precision: string;
}

export async function albumDetails(spotifyId: string): Promise<AlbumDetails> {
  if (!/^[A-Za-z0-9]{22}$/.test(spotifyId)) throw new HttpError(400, 'That is not a Spotify album id');
  const album = await get<SpotifyAlbum>(`albums/${spotifyId}`);
  const tracks = album.tracks?.items.map(track => track.name) ?? [];
  let next = album.tracks?.next ?? null;
  while (next) {
    const page: {items: {name: string}[]; next: string | null} = await get(next);
    tracks.push(...page.items.map(track => track.name));
    next = page.next;
  }
  return {
    id: album.id,
    url: album.external_urls.spotify,
    name: album.name,
    ...images(album),
    artists: album.artists.map(artist => artist.name),
    artistIds: album.artists.map(artist => artist.id),
    tracks,
    release: album.release_date,
    precision: album.release_date_precision,
  };
}

const adminChecks = new Map<string, {admin: boolean; until: number}>();

/** True when the bearer token belongs to the site owner's Spotify account. */
export async function isAdmin(userToken: string | null) {
  if (!userToken) return false;
  const known = adminChecks.get(userToken);
  if (known && Date.now() < known.until) return known.admin;
  let admin = false;
  try {
    const me = await get<{id: string}>('me', userToken);
    admin = me.id === process.env.ADMIN_SPOTIFY_USER_ID;
  } catch {
    admin = false;
  }
  adminChecks.set(userToken, {admin, until: Date.now() + 10 * 60 * 1000});
  return admin;
}
