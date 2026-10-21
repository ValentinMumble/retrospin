import type { SceneKey } from '../../src/types'

export const SCENE_KEYS: SceneKey[] = [
  'rnr',
  'pop',
  'roots',
  'psych',
  'art',
  'prog',
  'hard',
  'soft',
  'punk',
  'postpunk',
  'newwave',
  'alt',
  'dream',
  'britpop',
  'indie',
]

/** Last.fm tag patterns, most specific first: the first pattern a tag matches decides its scene. */
const TAG_SCENES: [RegExp, SceneKey][] = [
  [/shoegaze|dream ?pop|slowcore/, 'dream'],
  [/britpop/, 'britpop'],
  [/post-?punk|goth|darkwave|cold ?wave|dance-?punk|deathrock/, 'postpunk'],
  [/new wave|synth-?pop|synth pop|new romantic|minimal synth/, 'newwave'],
  [/grunge|alternative|college rock|noise rock/, 'alt'],
  [/punk|hardcore/, 'punk'],
  [/krautrock|progressive|prog/, 'prog'],
  [/glam|art rock|art pop/, 'art'],
  [/psychedel|psych|acid rock|space rock/, 'psych'],
  [/metal|hard rock|stoner|blues rock/, 'hard'],
  [/soft rock|aor|yacht|adult contemporary/, 'soft'],
  [/folk|singer-?songwriter|americana|country|bluegrass/, 'roots'],
  [/rock ?n'? ?roll|rock and roll|rockabilly|doo-?wop/, 'rnr'],
  [/british invasion|merseybeat|^beat$|sunshine pop|baroque pop/, 'pop'],
  [/indie|garage|lo-?fi|bedroom pop|math rock|emo/, 'indie'],
]

function sceneOfTag(tag: string, year: number) {
  const name = tag.toLowerCase().trim()
  // Plain "pop" means the 60s pop and beat scene only for records of that era.
  if (name === 'pop' || name === 'british') return year < 1970 ? 'pop' : null
  return TAG_SCENES.find(([pattern]) => pattern.test(name))?.[1] ?? null
}

/** Generic tags ("indie") name a scene less precisely than specific ones ("post-punk revival"). */
const SCENE_WEIGHT: Partial<Record<SceneKey, number>> = { indie: 0.6 }

/** The scene of the era, for albums whose tags say nothing useful. */
function sceneOfYear(year: number): SceneKey {
  if (year < 1963) return 'rnr'
  if (year < 1967) return 'pop'
  if (year < 1970) return 'psych'
  if (year < 1976) return 'hard'
  if (year < 1980) return 'punk'
  if (year < 1987) return 'newwave'
  if (year < 1995) return 'alt'
  return 'indie'
}

interface TagList {
  toptags?: { tag?: { name: string; count: number | string }[] }
}

async function topTags(params: Record<string, string>) {
  const key = process.env.LASTFM_API_KEY
  if (!key) return []
  const url = `https://ws.audioscrobbler.com/2.0/?${new URLSearchParams({ ...params, api_key: key, format: 'json', autocorrect: '1' })}`
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'retrospin/0.1' } })
    if (!response.ok) return []
    const answer = (await response.json()) as TagList
    return (answer.toptags?.tag ?? []).map((tag) => ({ name: tag.name, weight: Number(tag.count) || 0 }))
  } catch {
    return []
  }
}

interface Tag {
  name: string
  weight: number
}

export interface LastfmTags {
  album: Tag[]
  artist: Tag[]
}

/** The album's and its artist's top tags on Last.fm. */
export async function fetchTags(artist: string, album: string): Promise<LastfmTags> {
  const [albumTags, artistTags] = await Promise.all([
    topTags({ method: 'album.gettoptags', artist, album }),
    topTags({ method: 'artist.gettoptags', artist }),
  ])
  return { album: albumTags.slice(0, 15), artist: artistTags.slice(0, 15) }
}

/** Picks the scene whose tags weigh the most, album tags counting double the artist's. */
export function detectScene(tags: LastfmTags, year: number): SceneKey {
  const scores = new Map<SceneKey, number>()
  const add = (list: Tag[], factor: number) => {
    for (const tag of list) {
      const scene = sceneOfTag(tag.name, year)
      if (scene) {
        const points = Math.max(tag.weight, 1) * factor * (SCENE_WEIGHT[scene] ?? 1)
        scores.set(scene, (scores.get(scene) ?? 0) + points)
      }
    }
  }
  add(tags.album, 2)
  add(tags.artist, 1)
  const best = [...scores.entries()].sort((first, second) => second[1] - first[1])[0]
  return best?.[0] ?? sceneOfYear(year)
}

/** Album and artist tags in one list for the genre explorer, the same mix as scripts/build_tags.py. */
export function mergeTags(tags: LastfmTags): [string, number][] {
  const weights = new Map<string, number>()
  const add = (list: Tag[], factor: number) => {
    for (const tag of list) {
      const name = tag.name.trim().toLowerCase()
      if (name) weights.set(name, (weights.get(name) ?? 0) + Math.max(tag.weight, 1) * factor)
    }
  }
  add(tags.album, 2)
  add(tags.artist, 1)
  return [...weights.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, 12)
}
