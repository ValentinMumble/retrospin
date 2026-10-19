/** The country of an artist, from MusicBrainz (Spotify has none). Best effort: null when unsure. */

const AGENT = 'retrospin/0.1 (https://retrospin.vumble.dev)'

async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = `https://musicbrainz.org/ws/2/${path}?${new URLSearchParams({ ...params, fmt: 'json' })}`
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' } })
    if (response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      continue
    }
    return response.ok ? ((await response.json()) as T) : null
  }
  return null
}

interface Artist {
  name?: string
  score?: number
  country?: string
  area?: { 'iso-3166-1-codes'?: string[] }
}

function countryOf(artist: Artist | null) {
  return artist?.country ?? artist?.area?.['iso-3166-1-codes']?.[0] ?? null
}

export async function artistCountry(spotifyArtistId: string, name: string, normalize: (text: string) => string) {
  try {
    const link = await get<{ relations?: { artist?: { id: string } }[] }>('url', {
      resource: `https://open.spotify.com/artist/${spotifyArtistId}`,
      inc: 'artist-rels',
    })
    const mbid = link?.relations?.find((relation) => relation.artist)?.artist?.id
    if (mbid) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const country = countryOf(await get<Artist>(`artist/${mbid}`, {}))
      if (country) return country
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const found = await get<{ artists?: Artist[] }>('artist', {
      query: `artist:"${name.replace(/"/g, '')}"`,
      limit: '5',
    })
    const match = found?.artists?.find(
      (artist) => (artist.score ?? 0) >= 90 && normalize(artist.name ?? '') === normalize(name) && countryOf(artist),
    )
    return countryOf(match ?? null)
  } catch {
    return null
  }
}
