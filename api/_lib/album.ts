import type { Album } from '../../src/types'
import { similarArtists } from './lastfm.js'
import { artistCountry } from './musicbrainz.js'
import { normalize, slug, tidy } from './names.js'
import { detectScene, fetchTags, mergeTags } from './scene.js'
import { albumDetails } from './spotify.js'
import { ALBUMS, PENDING, redis, SIMILAR, SPOTIFY_IDS } from './store.js'

/** Builds a timeline album from a Spotify album: cover, links, songs, plus scene (Last.fm) and country (MusicBrainz). */
export async function buildAlbum(spotifyId: string, options: { note: string; year: number | null }): Promise<Album> {
  const details = await albumDetails(spotifyId)
  const title = tidy(details.name) || details.name
  const artist = details.artists.join(' & ')
  const releaseYear = Number(details.release.slice(0, 4))
  const year = options.year ?? releaseYear
  const [tags, country] = await Promise.all([
    fetchTags(details.artists[0], title),
    artistCountry(details.artistIds[0], details.artists[0], normalize),
  ])
  return {
    id: slug(`${artist} ${title}`),
    year,
    date: year === releaseYear && details.precision === 'day' ? details.release : String(year),
    artist,
    title,
    scene: detectScene(tags, year),
    country,
    tags: mergeTags(tags),
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
  await rememberSimilarArtists(stored.artist)
  return stored
}

/** Stores the artist's similar artists once, so the new album gets its links in the galaxy. Best effort. */
async function rememberSimilarArtists(artist: string) {
  try {
    const store = redis()
    if (await store.hexists(SIMILAR, artist)) return
    let artists = await similarArtists(artist)
    if (artists.length === 0 && artist.includes(' & ')) artists = await similarArtists(artist.split(' & ')[0])
    await store.hset(SIMILAR, { [artist]: artists.slice(0, 100).map((item) => [item.name, item.match]) })
  } catch (error) {
    console.error('Could not store similar artists', artist, error)
  }
}
