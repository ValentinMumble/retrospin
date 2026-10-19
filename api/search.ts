import { clientIp, handle, HttpError, json } from './_lib/http.js'
import { searchAlbums } from './_lib/spotify.js'
import { PENDING, rateLimit, redis, SPOTIFY_IDS } from './_lib/store.js'

/** GET /api/search?q=: Spotify albums for the suggest form, each marked if already on the timeline or in review. */
export function GET(request: Request) {
  return handle(async () => {
    const query = (new URL(request.url).searchParams.get('q') ?? '').trim()
    if (query.length < 2) throw new HttpError(400, 'Type at least two letters')
    if (query.length > 100) throw new HttpError(400, 'That search is too long')
    await rateLimit(`search:${clientIp(request)}`, 150, 3600)
    const candidates = await searchAlbums(query)
    if (candidates.length === 0) return json({ results: [] })
    const store = redis()
    const ids = candidates.map((candidate) => candidate.spotifyId)
    const pipeline = store.pipeline()
    pipeline.smismember(SPOTIFY_IDS, ids)
    for (const id of ids) pipeline.hexists(PENDING, id)
    const [published, ...pending] = (await pipeline.exec()) as [number[], ...number[]]
    return json({
      results: candidates.map((candidate, index) => ({
        ...candidate,
        status: published[index] ? 'published' : pending[index] ? 'pending' : null,
      })),
    })
  })
}
