import type {Album} from '../src/types';
import {handle, json} from './_lib/http.js';
import {normalize} from './_lib/names.js';
import {ALBUMS, redis, SIMILAR} from './_lib/store.js';

/** Links per album to its most similar records. */
const LINKS_PER_ALBUM = 4;

/** [album id, album id, strength 0-1, kind] */
type Link = [string, string, number, 'similar' | 'artist'];

function artistKeys(artist: string) {
  const keys = new Set([normalize(artist)]);
  if (artist.includes(' & ')) for (const part of artist.split(' & ')) keys.add(normalize(part));
  return keys;
}

/**
 * GET /api/galaxy: the links between albums. Each album links to the records of its most similar artists
 * (Last.fm), closer years first, and each artist's records are chained in order. Cached by the CDN for an hour.
 */
export function GET() {
  return handle(async () => {
    const store = redis();
    const [stored, similar] = await Promise.all([
      store.hgetall<Record<string, Album>>(ALBUMS),
      store.hgetall<Record<string, [string, number][]>>(SIMILAR),
    ]);
    const albums = Object.values(stored ?? {});
    const byArtist = new Map<string, Album[]>();
    for (const album of albums) {
      for (const key of artistKeys(album.artist)) byArtist.set(key, [...(byArtist.get(key) ?? []), album]);
    }

    const links = new Map<string, Link>();
    const add = (first: string, second: string, strength: number, kind: Link[3]) => {
      const [low, high] = first < second ? [first, second] : [second, first];
      const key = `${low}|${high}`;
      const known = links.get(key);
      if (!known || known[2] < strength) links.set(key, [low, high, Math.round(strength * 1000) / 1000, kind]);
    };

    for (const album of albums) {
      const own = artistKeys(album.artist);
      const best = new Map<string, number>();
      for (const [name, match] of similar?.[album.artist] ?? []) {
        const key = normalize(name);
        if (own.has(key)) continue;
        for (const other of byArtist.get(key) ?? []) {
          // Similar artists, and the closer in time the stronger the link.
          const strength = match * (1 - Math.min(Math.abs(other.year - album.year), 30) / 60);
          if (strength > (best.get(other.id) ?? 0)) best.set(other.id, strength);
        }
      }
      [...best.entries()]
        .sort((first, second) => second[1] - first[1])
        .slice(0, LINKS_PER_ALBUM)
        .forEach(([otherId, strength]) => add(album.id, otherId, strength, 'similar'));
    }

    // An artist's records, one after the other.
    const byExactArtist = new Map<string, Album[]>();
    for (const album of albums) {
      const key = normalize(album.artist);
      byExactArtist.set(key, [...(byExactArtist.get(key) ?? []), album]);
    }
    for (const records of byExactArtist.values()) {
      const ordered = [...records].sort((first, second) => first.year - second.year);
      for (let index = 1; index < ordered.length; index += 1)
        add(ordered[index - 1].id, ordered[index].id, 0.9, 'artist');
    }

    const artistsWithData = albums.filter(album => similar?.[album.artist]).length;
    return json(
      {links: [...links.values()], coverage: {albums: albums.length, withSimilarArtists: artistsWithData}},
      {headers: {'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'}},
    );
  });
}
