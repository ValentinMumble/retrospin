import type {Album, SceneKey} from '../src/types';
import {publish} from './_lib/album.js';
import {bearerToken, handle, HttpError, json, readJson} from './_lib/http.js';
import {SCENE_KEYS} from './_lib/scene.js';
import {isAdmin} from './_lib/spotify.js';
import {ALBUMS, PENDING, redis, SPOTIFY_IDS, type Suggestion} from './_lib/store.js';
import {cleanNote, cleanYear} from './suggest.js';

async function requireAdmin(request: Request) {
  if (!(await isAdmin(bearerToken(request)))) throw new HttpError(403, 'Only the site owner can review suggestions');
}

/** GET /api/review: the suggestions waiting for review, oldest first. Owner only. */
export function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const pending = (await redis().hgetall<Record<string, Suggestion>>(PENDING)) ?? {};
    const suggestions = Object.values(pending).sort((first, second) =>
      first.suggestedAt.localeCompare(second.suggestedAt),
    );
    return json({suggestions});
  });
}

/**
 * POST /api/review: owner only.
 * { action: 'approve', spotifyId, scene?, year?, note? } publishes a suggestion, with corrections.
 * { action: 'reject', spotifyId } drops it. { action: 'remove', albumId } takes an album off the timeline.
 */
export function POST(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const body = await readJson(request);
    const store = redis();
    if (body.action === 'remove') {
      const albumId = String(body.albumId ?? '');
      const album = await store.hget<Album>(ALBUMS, albumId);
      if (!album) throw new HttpError(404, 'No such album on the timeline');
      await store.hdel(ALBUMS, albumId);
      if (album.spotify) await store.srem(SPOTIFY_IDS, album.spotify.id);
      return json({status: 'removed'});
    }
    const spotifyId = String(body.spotifyId ?? '');
    const suggestion = await store.hget<Suggestion>(PENDING, spotifyId);
    if (!suggestion) throw new HttpError(404, 'No such suggestion');
    if (body.action === 'reject') {
      await store.hdel(PENDING, spotifyId);
      return json({status: 'rejected'});
    }
    if (body.action !== 'approve') throw new HttpError(400, 'Unknown action');
    const scene = SCENE_KEYS.includes(body.scene as SceneKey) ? (body.scene as SceneKey) : suggestion.scene;
    const year = cleanYear(body.year) ?? suggestion.year;
    const note = body.note === undefined ? suggestion.note : cleanNote(body.note);
    const {suggestedAt: _suggestedAt, ...album} = suggestion;
    const date = year === suggestion.year ? suggestion.date : String(year);
    return json({status: 'published', album: await publish({...album, scene, year, date, note})});
  });
}
