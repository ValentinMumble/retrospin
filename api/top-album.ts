import {clientIp, handle, HttpError, json} from './_lib/http.js';
import {topAlbum} from './_lib/lastfm.js';
import {rateLimit} from './_lib/store.js';

/** GET /api/top-album?artist=: the artist's best-known studio album, from Last.fm listeners. */
export function GET(request: Request) {
  return handle(async () => {
    const artist = (new URL(request.url).searchParams.get('artist') ?? '').trim();
    if (!artist || artist.length > 200) throw new HttpError(400, 'Give an artist name');
    await rateLimit(`top-album:${clientIp(request)}`, 600, 3600);
    const album = await topAlbum(artist);
    return json({album}, {headers: {'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400'}});
  });
}
