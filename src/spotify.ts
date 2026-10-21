/**
 * Spotify login in the browser (authorization code flow with PKCE: no server, no secret) and the liked songs.
 * The access token lives in this browser's localStorage only.
 */

const CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? '';
const SCOPES = 'user-library-read';
const TOKEN_KEY = 'retrospin.spotify.token';
const LIKES_KEY = 'retrospin.spotify.likes';
const PENDING_KEY = 'retrospin.spotify.pending';

export const loginAvailable = CLIENT_ID !== '';

export interface LikedTrack {
  id: string;
  name: string;
  artistIds: string[];
  album: {id: string; name: string; artistIds: string[]};
}

interface Token {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface Pending {
  verifier: string;
  state: string;
  returnHash: string;
}

function read<T>(storage: Storage, key: string): T | null {
  try {
    const value = storage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: unknown) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the login just won't survive a reload.
  }
}

/** Spotify only accepts https or a loopback IP (not "localhost") as redirect address. */
export function redirectUri() {
  return `${window.location.origin}/`;
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomString(length: number) {
  return base64url(crypto.getRandomValues(new Uint8Array(length))).slice(0, length);
}

export async function startLogin() {
  const verifier = randomString(64);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const state = randomString(16);
  write(sessionStorage, PENDING_KEY, {verifier, state, returnHash: window.location.hash} satisfies Pending);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: base64url(new Uint8Array(digest)),
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function requestToken(body: Record<string, string>, previousRefresh = ''): Promise<Token> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: CLIENT_ID, ...body}),
  });
  if (!response.ok) throw new Error(`Spotify refused the login (${response.status})`);
  const data = (await response.json()) as {access_token: string; refresh_token?: string; expires_in: number};
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
}

/** Finishes a login when Spotify sends the browser back with ?code=. Returns true if it did. */
export async function completeLogin(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return false;
  const pending = read<Pending>(sessionStorage, PENDING_KEY);
  write(sessionStorage, PENDING_KEY, null);
  window.history.replaceState(null, '', window.location.pathname + (pending?.returnHash ?? ''));
  if (error)
    throw new Error(error === 'access_denied' ? 'Spotify login was cancelled' : `Spotify login failed (${error})`);
  if (!code || !pending || params.get('state') !== pending.state) throw new Error('Spotify login did not complete');
  const token = await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: pending.verifier,
  });
  write(localStorage, TOKEN_KEY, token);
  return true;
}

export function isLoggedIn() {
  return read<Token>(localStorage, TOKEN_KEY) !== null;
}

export function logout() {
  write(localStorage, TOKEN_KEY, null);
  write(localStorage, LIKES_KEY, null);
}

async function accessToken() {
  const token = read<Token>(localStorage, TOKEN_KEY);
  if (!token) throw new Error('Not connected to Spotify');
  if (Date.now() < token.expiresAt) return token.accessToken;
  try {
    const fresh = await requestToken(
      {grant_type: 'refresh_token', refresh_token: token.refreshToken},
      token.refreshToken,
    );
    write(localStorage, TOKEN_KEY, fresh);
    return fresh.accessToken;
  } catch {
    // Revoked or expired for good: forget it, so the page offers to connect again.
    logout();
    throw new Error('Your Spotify session ended, connect again');
  }
}

/** The Spotify access token of the logged-in visitor, or null. */
export async function currentAccessToken() {
  return isLoggedIn() ? accessToken() : null;
}

async function api<T>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `https://api.spotify.com/v1${pathOrUrl}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {headers: {Authorization: `Bearer ${await accessToken()}`}});
    if (response.status === 429) {
      const wait = Number(response.headers.get('Retry-After') ?? '2');
      await new Promise(resolve => setTimeout(resolve, wait * 1000));
      continue;
    }
    if (response.status === 401) {
      logout();
      throw new Error('Your Spotify session ended, connect again');
    }
    if (!response.ok) throw new Error(`Spotify answered ${response.status}`);
    return (await response.json()) as T;
  }
  throw new Error('Spotify is busy, try again in a minute');
}

interface SpotifyTrack {
  id: string | null;
  name: string;
  artists: {id: string}[];
  album: {id: string; name: string; artists: {id: string}[]};
}

export async function fetchProfile() {
  const me = await api<{id: string; display_name: string | null}>('/me');
  return {name: me.display_name || me.id};
}

export async function fetchLikedTracks(): Promise<LikedTrack[]> {
  const tracks: LikedTrack[] = [];
  let next: string | null = '/me/tracks?limit=50';
  while (next) {
    const page: {items: {track: SpotifyTrack | null}[]; next: string | null} = await api(next);
    for (const {track} of page.items) {
      if (!track?.id) continue;
      tracks.push({
        id: track.id,
        name: track.name,
        artistIds: track.artists.map(artist => artist.id),
        album: {
          id: track.album.id,
          name: track.album.name,
          artistIds: track.album.artists.map(artist => artist.id),
        },
      });
    }
    next = page.next;
  }
  write(localStorage, LIKES_KEY, tracks);
  return tracks;
}

/** The liked songs from the last visit, to show hearts before the fresh list arrives. */
export function cachedLikedTracks() {
  return read<LikedTrack[]>(localStorage, LIKES_KEY);
}
