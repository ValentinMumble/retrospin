import { normalize } from './likes'
import type { Album } from './types'

/** Spellings of one genre that Last.fm listeners mix, folded into one name. */
const ALIASES: Record<string, string> = {
  postpunk: 'post-punk',
  'post punk': 'post-punk',
  'kraut rock': 'krautrock',
  kraut: 'krautrock',
  'rock n roll': "rock 'n' roll",
  "rock'n'roll": "rock 'n' roll",
  "rock 'n roll": "rock 'n' roll",
  'rock and roll': "rock 'n' roll",
  'rock & roll': "rock 'n' roll",
  'hip hop': 'hip-hop',
  'synth pop': 'synthpop',
  'synth-pop': 'synthpop',
  dreampop: 'dream pop',
  progressive: 'progressive rock',
  'prog rock': 'progressive rock',
  prog: 'progressive rock',
  psychedelic: 'psychedelic rock',
  psych: 'psychedelic rock',
  alternative: 'alternative rock',
  indie: 'indie rock',
  lofi: 'lo-fi',
  garage: 'garage rock',
  'post rock': 'post-rock',
  'noise-rock': 'noise rock',
  'proto punk': 'proto-punk',
  protopunk: 'proto-punk',
  'art-rock': 'art rock',
  'new-wave': 'new wave',
  electronica: 'electronic',
  'heavy metal': 'metal',
  goth: 'gothic rock',
  gothic: 'gothic rock',
  'goth rock': 'gothic rock',
  'folk-rock': 'folk rock',
  'jazz-rock': 'jazz rock',
  'dance punk': 'dance-punk',
  'neo psychedelia': 'neo-psychedelia',
  shoegazing: 'shoegaze',
  'singer songwriter': 'singer-songwriter',
  'soft-rock': 'soft rock',
  'yatch rock': 'yacht rock',
  surf: 'surf rock',
}

/** Words a genre's name carries. A tag without one is a mood, a place, a band or a note to self. */
const GENRE_WORDS =
  /rock|pop|punk|wave|folk|metal|jazz|soul|core|gaze|psych|blues|country|electr|ambient|hop|house|techno|disco|funk|dance|indie|garage|grunge|\bemo\b|twee|lo-fi|noise|drone|goth|synth|\bbeat\b|merseybeat|surf|\bska\b|reggae|\bdub\b|doo-?wop|americana|singer-songwriter|experimental|avant|baroque|chamber|minimal|industrial|romantic|british invasion|new age|^aor$|^mod$|rave|lounge|exotica|gospel|bluegrass|tropicalia|zeuhl|canterbury|kosmische|motorik/

/** Tags that read like genres but say nothing (rock, on a rock timeline), or are listeners' jokes and notes. */
const NOT_A_GENRE =
  /^(rock|pop|classic rock|oldies|album rock|jizz jazz|not jazz)$|^\d|favou?rite|\bbest\b|seen live|\bmy\b|\bown\b|\blove\b|wishlist|vinyl|vocalist/

/** A tag counts as one of the album's genres when it weighs at least this share of its heaviest genre. */
const MIN_SHARE = 0.18
const MAX_GENRES = 6

/** The genre a Last.fm tag names, or null for a tag that is not a genre. */
export function genreOf(tag: string) {
  const name = tag.trim().toLowerCase().replace(/\s+/g, ' ')
  const genre = ALIASES[name] ?? name
  return GENRE_WORDS.test(genre) && !NOT_A_GENRE.test(genre) ? genre : null
}

/** Last.fm writes tags in lower case: "post-punk" reads "Post-punk", "new wave" reads "New wave". */
export function genreLabel(genre: string) {
  return genre.charAt(0).toUpperCase() + genre.slice(1)
}

const genresCache = new WeakMap<Album, string[]>()

/** The album's genres, the heaviest first. */
export function albumGenres(album: Album): string[] {
  const cached = genresCache.get(album)
  if (cached) return cached
  // A band's name used as a tag ("dire straits" on Dire Straits records) is not a genre either.
  const artist = normalize(album.artist)
  const candidates = (album.tags ?? []).flatMap(([tag, weight]) => {
    const genre = genreOf(tag)
    return genre && normalize(genre) !== artist ? [{ genre, weight }] : []
  })
  const top = candidates[0]?.weight ?? 0
  const genres: string[] = []
  for (const { genre, weight } of candidates) {
    if (weight < top * MIN_SHARE || genres.length === MAX_GENRES) break
    if (!genres.includes(genre)) genres.push(genre)
  }
  genresCache.set(album, genres)
  return genres
}

/** Albums by genre, each list in timeline order. */
export function genreIndex(albums: Album[]) {
  const index = new Map<string, Album[]>()
  for (const album of albums) {
    for (const genre of albumGenres(album)) index.set(genre, [...(index.get(genre) ?? []), album])
  }
  return index
}

/** Genres that share albums with this one, the closest first (cosine of their album sets). */
export function relatedGenres(genre: string, index: ReadonlyMap<string, Album[]>, limit = 12) {
  const members = index.get(genre) ?? []
  const shared = new Map<string, number>()
  for (const album of members) {
    for (const other of albumGenres(album)) {
      if (other !== genre) shared.set(other, (shared.get(other) ?? 0) + 1)
    }
  }
  return [...shared.entries()]
    .map(([name, count]) => ({ name, score: count / Math.sqrt(members.length * (index.get(name)?.length ?? 1)) }))
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
    .slice(0, limit)
    .map((item) => item.name)
}
