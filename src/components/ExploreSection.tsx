import {useEffect, useMemo, useState} from 'react';
import {fetchSimilarArtists, fetchTopAlbum, type SimilarArtist, type TopAlbum} from '../api';
import {normalize} from '../likes';
import type {Album} from '../types';

interface ExploreSectionProps {
  album: Album;
  allAlbums: Album[];
  /** The site owner adds albums directly; visitors suggest them. */
  owner: boolean;
  lit: boolean;
  onJump: (id: string) => void;
  onSuggest: (query: string) => void;
  onLight: (ids: ReadonlySet<string> | null) => void;
}

const GROUP_SIZE = 6;
const MISSING_SIZE = 4;
// Answers stay for the visit, so going back to an album shows its section at once.
const similarCache = new Map<string, SimilarArtist[]>();
const topAlbumCache = new Map<string, TopAlbum | null>();

/** Names an album answers to: "The Velvet Underground & Nico" also counts for each of its two artists. */
function artistKeys(artist: string) {
  const keys = new Set([normalize(artist)]);
  if (artist.includes(' & ')) for (const part of artist.split(' & ')) keys.add(normalize(part));
  return keys;
}

export function ExploreSection({album, allAlbums, owner, lit, onJump, onSuggest, onLight}: ExploreSectionProps) {
  const [similar, setSimilar] = useState<SimilarArtist[] | null>(() => similarCache.get(album.artist) ?? null);
  const [missingAlbums, setMissingAlbums] = useState<TopAlbum[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (similarCache.has(album.artist)) return;
    let cancelled = false;
    const load = async () => {
      try {
        const artists = await fetchSimilarArtists(album.artist);
        similarCache.set(album.artist, artists);
        if (!cancelled) setSimilar(artists);
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [album.artist]);

  const byArtist = useMemo(() => {
    const index = new Map<string, Album[]>();
    for (const item of allAlbums) {
      for (const key of artistKeys(item.artist)) index.set(key, [...(index.get(key) ?? []), item]);
    }
    return index;
  }, [allAlbums]);

  const related = useMemo(() => {
    if (!similar) return null;
    const own = artistKeys(album.artist);
    const seen = new Set<string>();
    const before: Album[] = [];
    const sameYear: Album[] = [];
    const after: Album[] = [];
    const missing: string[] = [];
    for (const artist of similar) {
      const key = normalize(artist.name);
      if (own.has(key) || seen.has(key)) continue;
      seen.add(key);
      const found = byArtist.get(key);
      if (!found) {
        missing.push(artist.name);
        continue;
      }
      // The artist's record closest in time to this one.
      const closest = [...found].sort(
        (first, second) => Math.abs(first.year - album.year) - Math.abs(second.year - album.year),
      )[0];
      if (closest.id === album.id) continue;
      if (closest.year < album.year) before.push(closest);
      else if (closest.year > album.year) after.push(closest);
      else sameYear.push(closest);
    }
    return {before, sameYear, after, missing};
  }, [similar, byArtist, album]);

  // The best-known album of the closest similar artists that are not on the timeline yet.
  const missingKey = related?.missing.slice(0, MISSING_SIZE + 2).join('|') ?? '';
  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    const load = async () => {
      const found = await Promise.all(
        missingKey.split('|').map(async artist => {
          if (!topAlbumCache.has(artist)) topAlbumCache.set(artist, await fetchTopAlbum(artist).catch(() => null));
          return topAlbumCache.get(artist) ?? null;
        }),
      );
      if (!cancelled) setMissingAlbums(found.filter((item): item is TopAlbum => item !== null).slice(0, MISSING_SIZE));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  const relatedIds = useMemo(
    () =>
      related
        ? new Set([album.id, ...[...related.before, ...related.sameYear, ...related.after].map(item => item.id)])
        : null,
    [related, album.id],
  );

  const groups = related
    ? [
        {label: 'Came before', items: related.before.slice(0, GROUP_SIZE)},
        {label: 'Same year', items: related.sameYear.slice(0, GROUP_SIZE)},
        {label: 'Came after', items: related.after.slice(0, GROUP_SIZE)},
      ].filter(group => group.items.length > 0)
    : [];
  const relatedCount = relatedIds ? relatedIds.size - 1 : 0;

  return (
    <section className="explore" aria-label="Explore similar records">
      <h3>Explore</h3>
      {error && <p className="field-hint">{error}</p>}
      {!related && !error && <p className="field-hint">Finding similar records…</p>}
      {related && relatedCount > 0 && (
        <button
          type="button"
          className="toggle light-up"
          aria-pressed={lit}
          onClick={() => onLight(lit ? null : relatedIds)}
        >
          {lit ? 'Turn the lights back on' : `Light up the ${relatedCount} related records`}
        </button>
      )}
      {groups.map(group => (
        <div key={group.label}>
          <p className="explore-label">{group.label}</p>
          <ul className="explore-list">
            {group.items.map(item => (
              <li key={item.id}>
                <button type="button" className="explore-item" onClick={() => onJump(item.id)}>
                  {item.spotify?.coverSmall ? (
                    <img src={item.spotify.coverSmall} alt="" />
                  ) : (
                    <span className="result-blank" />
                  )}
                  <span className="result-text">
                    <span className="result-title">{item.title}</span>
                    <span className="result-meta">
                      {item.artist} · {item.year}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {missingAlbums && missingAlbums.length > 0 && (
        <div>
          <p className="explore-label">Not on the timeline yet</p>
          <ul className="explore-list">
            {missingAlbums.map(item => (
              <li key={`${item.artist} ${item.title}`} className="explore-item is-missing">
                {item.image ? <img src={item.image} alt="" /> : <span className="result-blank" />}
                <span className="result-text">
                  <span className="result-title">{item.title}</span>
                  <span className="result-meta">{item.artist}</span>
                </span>
                <button type="button" className="text-button" onClick={() => onSuggest(`${item.artist} ${item.title}`)}>
                  {owner ? 'Add' : 'Suggest'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {related && groups.length === 0 && related.missing.length === 0 && (
        <p className="field-hint">No similar records found.</p>
      )}
      <p className="explore-credit">
        Similar artists from{' '}
        <a href={`https://www.last.fm/music/${encodeURIComponent(album.artist)}`} target="_blank" rel="noreferrer">
          Last.fm
        </a>
      </p>
    </section>
  );
}
