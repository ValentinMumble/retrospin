import type {Album} from './types';
import type {LikedTrack} from './spotify';

export interface AlbumLikes {
  /** Liked songs that are on this album. */
  songs: string[];
  /** Liked songs by this album's artists, on any record. */
  artistLikes: number;
}

export type LikesByAlbum = ReadonlyMap<string, AlbumLikes>;

const EXTRA_WORDS =
  /remaster|deluxe|edition|anniversary|expanded|version|mono|stereo|bonus|legacy|collector|super|reissue|definitive|feat\.|with /i;
const SUFFIX = /\s+-\s+.*\b(remaster\w*|edition|version|anniversary|mono|stereo|live|mix|edit)\b.*$/i;

/** A song or album name without remaster, edition and featuring tags. */
export function tidy(name: string) {
  return name
    .replace(/\s*[([][^)\]]*[)\]]/g, match => (EXTRA_WORDS.test(match) ? '' : match))
    .replace(SUFFIX, '')
    .replace(/\s+(\d+(st|nd|rd|th)\s+)?(anniversary|deluxe|expanded|remastered)\b.*$/i, '')
    .trim();
}

/** Comparable form of a name: tidied, no accents, no punctuation, no leading "the". */
export function normalize(text: string) {
  return tidy(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/**
 * Places each liked song on its album of the timeline. A liked song from a single or a best-of lands on the
 * earliest album by the same artist that has a song with the same title.
 */
export function matchLikes(albums: Album[], tracks: LikedTrack[]): LikesByAlbum {
  const entries = albums
    .filter(album => album.spotify)
    .sort((first, second) => first.year - second.year)
    .map(album => ({
      album,
      artistIds: new Set(album.spotify!.artistIds),
      names: new Set([normalize(album.title), normalize(album.spotify!.name)]),
      tracks: new Set(album.spotify!.tracks.map(normalize)),
      songs: [] as string[],
    }));
  const shares = (ids: string[], set: Set<string>) => ids.some(id => set.has(id));

  const placed = new Set<string>();
  for (const track of tracks) {
    const albumName = normalize(track.album.name);
    const entry = entries.find(
      candidate =>
        candidate.album.spotify!.id === track.album.id ||
        (shares(track.album.artistIds, candidate.artistIds) && candidate.names.has(albumName)),
    );
    if (entry) {
      entry.songs.push(tidy(track.name));
      placed.add(track.id);
    }
  }
  for (const track of tracks) {
    if (placed.has(track.id)) continue;
    const name = normalize(track.name);
    const entry = entries.find(candidate => shares(track.artistIds, candidate.artistIds) && candidate.tracks.has(name));
    if (entry) entry.songs.push(tidy(track.name));
  }

  const result = new Map<string, AlbumLikes>();
  for (const entry of entries) {
    const artistLikes = tracks.filter(track => shares(track.artistIds, entry.artistIds)).length;
    if (artistLikes > 0) result.set(entry.album.id, {songs: [...new Set(entry.songs)], artistLikes});
  }
  return result;
}
