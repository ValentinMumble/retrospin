import { env, HttpError } from './http.js'
import { tidy } from './names.js'

/** Album names that are not studio albums: best-ofs, live records, reissue bundles. */
export const NOT_AN_ALBUM =
  /best of|greatest|hits|collection|anthology|\blive\b|essential|singles|definitive|gold|the very|platinum|unplugged|soundtrack|b-sides|rarities|demos|sessions|remix|\(null\)/i

/** Last.fm's placeholder picture (a grey star), returned when an album has no cover. */
const PLACEHOLDER = '2a96cbd8b46e442fc41c2b86b821562f'

export async function lastfm<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, api_key: env('LASTFM_API_KEY'), format: 'json', autocorrect: '1' })
  const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${query}`, {
    headers: { 'User-Agent': 'retrospin/0.1 (https://retrospin.vumble.dev)' },
  })
  if (response.status === 429) throw new HttpError(503, 'Last.fm is busy, try again in a minute')
  const answer = (await response.json()) as T & { error?: number }
  // Error 6 means "artist not found": an empty answer, not a failure.
  if (answer.error && answer.error !== 6) throw new HttpError(502, `Last.fm answered error ${answer.error}`)
  return answer
}

export interface SimilarArtist {
  name: string
  match: number
}

export async function similarArtists(artist: string): Promise<SimilarArtist[]> {
  const answer = await lastfm<{ similarartists?: { artist?: { name: string; match: string }[] } }>({
    method: 'artist.getsimilar',
    artist,
    limit: '80',
  })
  return (answer.similarartists?.artist ?? []).map((item) => ({ name: item.name, match: Number(item.match) || 0 }))
}

export interface TopAlbum {
  artist: string
  title: string
  image: string | null
}

interface LastfmAlbum {
  name: string
  artist: { name: string }
  image?: { '#text': string; size: string }[]
}

function toTopAlbum(album: LastfmAlbum): TopAlbum {
  const image = [...(album.image ?? [])].reverse().find((item) => item['#text'])?.['#text'] ?? ''
  // "Ege Bamyasi (Remastered Version)" reads "Ege Bamyasi".
  const title = tidy(album.name) || album.name
  return { artist: album.artist.name, title, image: image && !image.includes(PLACEHOLDER) ? image : null }
}

/** The artist's most played studio album on Last.fm. */
export async function topAlbum(artist: string): Promise<TopAlbum | null> {
  const answer = await lastfm<{ topalbums?: { album?: LastfmAlbum[] } }>({
    method: 'artist.gettopalbums',
    artist,
    limit: '10',
  })
  const album = (answer.topalbums?.album ?? []).find((item) => item.name && !NOT_AN_ALBUM.test(item.name))
  return album ? toTopAlbum(album) : null
}

export interface Genre {
  /** The opening of the tag's Last.fm wiki page, as plain text. */
  summary: string | null
  albums: TopAlbum[]
}

/** Turns a Last.fm wiki summary (HTML ending in a "Read more" link) into a few plain sentences. */
function plainSummary(html: string | undefined) {
  if (!html) return null
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
  const text = html
    .replace(/<a [^>]*>Read more on Last\.fm<\/a>\.?/i, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|\w+);/g, (entity, name: string) =>
      name.startsWith('#') ? String.fromCharCode(Number(name.slice(1))) : (entities[name] ?? entity),
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length < 20) return null
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text]
  let summary = ''
  for (const sentence of sentences) {
    if (summary && summary.length + sentence.length > 360) break
    summary += sentence
  }
  return summary.trim()
}

/** A tag's most played studio albums on Last.fm, and the start of its wiki page. */
export async function genre(tag: string): Promise<Genre> {
  const [top, info] = await Promise.all([
    lastfm<{ albums?: { album?: LastfmAlbum[] } }>({ method: 'tag.gettopalbums', tag, limit: '80' }),
    lastfm<{ tag?: { wiki?: { summary?: string } } }>({ method: 'tag.getinfo', tag }),
  ])
  const albums = (top.albums?.album ?? []).filter((item) => item.name && !NOT_AN_ALBUM.test(item.name))
  return { summary: plainSummary(info.tag?.wiki?.summary), albums: albums.map(toTopAlbum) }
}
