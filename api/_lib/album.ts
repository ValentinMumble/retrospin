import type { Album } from '../../src/types'
import { artistCountry } from './musicbrainz.js'
import { normalize, slug, tidy } from './names.js'
import { detectScene } from './scene.js'
import { albumDetails } from './spotify.js'
import { ALBUMS, PENDING, redis, SPOTIFY_IDS } from './store.js'

/** Builds a timeline album from a Spotify album: cover, links, songs, plus scene (Last.fm) and country (MusicBrainz). */
export async function buildAlbum(spotifyId: string, options: { note: string; year: number | null }): Promise<Album> {
  const details = await albumDetails(spotifyId)
  const title = tidy(details.name) || details.name
  const artist = details.artists.join(' & ')
  const releaseYear = Number(details.release.slice(0, 4))
  const year = options.year ?? releaseYear
  const [scene, country] = await Promise.all([
    detectScene(details.artists[0], title, year),
    artistCountry(details.artistIds[0], details.artists[0], normalize),
  ])
  return {
    id: slug(`${artist} ${title}`),
    year,
    date: year === releaseYear && details.precision === 'day' ? details.release : String(year),
    artist,
    title,
    scene,
    country,
    note: options.note,
    spotify: {
      id: details.id,
      url: details.url,
      name: details.name,
      cover: details.cover,
      coverSmall: details.coverSmall,
      artistIds: details.artistIds,
      tracks: details.tracks,
    },
  }
}

/** Puts an album on the timeline (and takes it out of the review queue). */
export async function publish(album: Album) {
  const store = redis()
  const taken = await store.hget<Album>(ALBUMS, album.id)
  // Same artist and title as another record (e.g. Weezer's several "Weezer"): keep both apart by year.
  const stored =
    taken && taken.spotify?.id !== album.spotify?.id ? { ...album, id: `${album.id}-${album.year}` } : album
  await store.hset(ALBUMS, { [stored.id]: stored })
  if (stored.spotify) {
    await store.sadd(SPOTIFY_IDS, stored.spotify.id)
    await store.hdel(PENDING, stored.spotify.id)
  }
  return stored
}
