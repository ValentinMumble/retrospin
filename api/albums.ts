import type { Album } from '../src/types'
import { handle, json } from './_lib/http.js'
import { ALBUMS, redis } from './_lib/store.js'

/** GET /api/albums: every album on the timeline. The CDN serves it for 5 minutes, then refreshes it in the background. */
export function GET() {
  return handle(async () => {
    const stored = (await redis().hgetall<Record<string, Album>>(ALBUMS)) ?? {}
    const albums = Object.values(stored).sort(
      (first, second) => first.date.localeCompare(second.date) || first.artist.localeCompare(second.artist),
    )
    return json({ albums }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' } })
  })
}
