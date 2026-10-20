import { clientIp, handle, HttpError, json } from './_lib/http.js'
import { similarArtists } from './_lib/lastfm.js'
import { rateLimit } from './_lib/store.js'

const WEEK = 'public, s-maxage=604800, stale-while-revalidate=86400'

/** GET /api/similar?artist=: artists similar to this one, from Last.fm, best match first. */
export function GET(request: Request) {
  return handle(async () => {
    const artist = (new URL(request.url).searchParams.get('artist') ?? '').trim()
    if (!artist || artist.length > 200) throw new HttpError(400, 'Give an artist name')
    await rateLimit(`similar:${clientIp(request)}`, 300, 3600)
    let artists = await similarArtists(artist)
    // "Neil Young & Crazy Horse", "The Velvet Underground & Nico": fall back to the first name.
    if (artists.length === 0 && artist.includes(' & ')) artists = await similarArtists(artist.split(' & ')[0])
    return json({ artists }, { headers: { 'Cache-Control': WEEK } })
  })
}
