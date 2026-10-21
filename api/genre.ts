import {clientIp, handle, HttpError, json} from './_lib/http.js';
import {genre} from './_lib/lastfm.js';
import {rateLimit} from './_lib/store.js';

/** GET /api/genre?tag=: the genre's most played albums on Last.fm and a short description. */
export function GET(request: Request) {
  return handle(async () => {
    const tag = (new URL(request.url).searchParams.get('tag') ?? '').trim().toLowerCase();
    if (!tag || tag.length > 100) throw new HttpError(400, 'Give a genre');
    await rateLimit(`genre:${clientIp(request)}`, 300, 3600);
    return json(await genre(tag), {
      headers: {'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400'},
    });
  });
}
