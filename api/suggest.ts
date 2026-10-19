import { buildAlbum, publish } from './_lib/album.js'
import { bearerToken, clientIp, handle, HttpError, json, readJson } from './_lib/http.js'
import { isAdmin } from './_lib/spotify.js'
import { PENDING, rateLimit, redis, SPOTIFY_IDS } from './_lib/store.js'

export function cleanNote(value: unknown) {
  if (typeof value !== 'string') return ''
  const printable = Array.from(value, (char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char))
  return printable.join('').trim().slice(0, 280)
}

export function cleanYear(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const year = Number(value)
  if (!Number.isInteger(year) || year < 1940 || year > new Date().getFullYear() + 1) {
    throw new HttpError(400, 'That year looks wrong')
  }
  return year
}

/**
 * POST /api/suggest { spotifyId, note?, year? }: suggests an album. The server fetches everything else.
 * Suggestions wait for the owner's review; the owner's own suggestions (Spotify token in Authorization) go live.
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request)
    const spotifyId = String(body.spotifyId ?? '')
    const note = cleanNote(body.note)
    const year = cleanYear(body.year)
    const admin = await isAdmin(bearerToken(request))
    if (!admin) await rateLimit(`suggest:${clientIp(request)}`, 10, 3600)
    const store = redis()
    if (await store.sismember(SPOTIFY_IDS, spotifyId)) throw new HttpError(409, 'This album is already on the timeline')
    if (!admin && (await store.hexists(PENDING, spotifyId))) {
      throw new HttpError(409, 'Someone already suggested this album, it is waiting for review')
    }
    const album = await buildAlbum(spotifyId, { note, year })
    if (admin) return json({ status: 'published', album: await publish(album) }, { status: 201 })
    await store.hset(PENDING, { [spotifyId]: { ...album, suggestedAt: new Date().toISOString() } })
    return json({ status: 'pending', album }, { status: 201 })
  })
}
