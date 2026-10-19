export type SceneKey =
  | 'rnr'
  | 'pop'
  | 'roots'
  | 'psych'
  | 'art'
  | 'prog'
  | 'hard'
  | 'soft'
  | 'punk'
  | 'postpunk'
  | 'newwave'
  | 'alt'
  | 'dream'
  | 'britpop'
  | 'indie'

export interface Album {
  id: string
  year: number
  /** "YYYY-MM-DD" when the exact release day is known, else "YYYY". */
  date: string
  artist: string
  title: string
  scene: SceneKey
  /** Two-letter country code of the album's first artist, from MusicBrainz. */
  country: string | null
  note: string
  spotify: {
    id: string
    url: string
    /** The album's name on Spotify, which may be a reissue's name. */
    name: string
    cover: string | null
    coverSmall: string | null
    artistIds: string[]
    /** Song names, to place a liked song from a best-of on its original album. */
    tracks: string[]
  } | null
}

export interface Catalog {
  generatedAt: string
  albums: Album[]
}
