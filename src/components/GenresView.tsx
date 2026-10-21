import { useEffect, useMemo, useState } from 'react'
import { fetchGenre, type GenreDetails } from '../api'
import { genreIndex, genreLabel, genreOf, relatedGenres } from '../genres'
import { normalize, type LikesByAlbum } from '../likes'
import { cssVars } from '../style'
import type { Album } from '../types'

interface GenresViewProps {
  /** The albums the filters let through. */
  albums: Album[]
  /** Every album, to tell which of Last.fm's top albums are on the timeline already. */
  allAlbums: Album[]
  likes: LikesByAlbum | null
  genre: string | null
  /** The site owner adds albums directly; visitors suggest them. */
  owner: boolean
  /** The genre lit up on the timeline, if any. */
  litGenre: string | null
  selectedId: string | null
  onGenre: (genre: string | null) => void
  onOpen: (id: string) => void
  onLight: (genre: string, ids: ReadonlySet<string> | null) => void
  onSuggest: (query: string) => void
}

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]
const MISSING_SIZE = 10
// Answers stay for the visit, so going back to a genre shows it at once.
const genreCache = new Map<string, GenreDetails>()

/** Keys an album answers to: "The Velvet Underground & Nico" also counts for each of its two artists. */
function albumKeys(artist: string, title: string) {
  const names = artist.includes(' & ') ? [artist, ...artist.split(' & ')] : [artist]
  return names.map((name) => `${normalize(name)}|${normalize(title)}`)
}

export function GenresView({
  albums,
  allAlbums,
  likes,
  genre,
  owner,
  litGenre,
  selectedId,
  onGenre,
  onOpen,
  onLight,
  onSuggest,
}: GenresViewProps) {
  const [find, setFind] = useState('')
  const [byLikes, setByLikes] = useState(false)
  const [answer, setAnswer] = useState<{ genre: string; details: GenreDetails | null; error: string | null } | null>(
    null,
  )

  const index = useMemo(() => genreIndex(albums), [albums])
  const sortByLikes = byLikes && likes !== null
  const ranking = useMemo(() => {
    const rows = [...index.entries()].map(([name, list]) => ({
      name,
      count: list.length,
      liked: likes ? list.filter((album) => likes.has(album.id)).length : 0,
    }))
    return rows.sort((first, second) =>
      sortByLikes
        ? second.liked - first.liked || second.count - first.count || first.name.localeCompare(second.name)
        : second.count - first.count || first.name.localeCompare(second.name),
    )
  }, [index, likes, sortByLikes])
  const top = ranking[0]?.count ?? 1

  const needle = normalize(find)
  const shown = needle
    ? ranking.filter((row) => normalize(row.name).includes(needle))
    : ranking.filter((row) => row.count > 1 || (sortByLikes && row.liked > 0))
  // A genre that no album on the timeline carries can still be explored, from Last.fm alone.
  const typed = needle ? genreOf(find) : null
  const offTimeline = typed && !index.has(typed) ? typed : null

  const members = useMemo(() => (genre ? (index.get(genre) ?? []) : []), [index, genre])
  const related = useMemo(() => (genre ? relatedGenres(genre, index) : []), [index, genre])
  const decades = DECADES.map((decade) => ({
    decade,
    count: members.filter((album) => album.year >= decade && album.year < decade + 10).length,
  }))
  const busiest = Math.max(1, ...decades.map((item) => item.count))
  const likedCount = likes ? members.filter((album) => likes.has(album.id)).length : 0
  const memberIds = useMemo(() => new Set(members.map((album) => album.id)), [members])
  const lit = genre !== null && litGenre === genre

  useEffect(() => {
    if (!genre || genreCache.has(genre)) return
    let cancelled = false
    const load = async () => {
      try {
        const details = await fetchGenre(genre)
        genreCache.set(genre, details)
        if (!cancelled) setAnswer({ genre, details, error: null })
      } catch (problem) {
        if (!cancelled)
          setAnswer({ genre, details: null, error: problem instanceof Error ? problem.message : String(problem) })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [genre])
  const details = genre ? (genreCache.get(genre) ?? (answer?.genre === genre ? answer.details : null)) : null
  const detailsError = genre && answer?.genre === genre ? answer.error : null

  const known = useMemo(() => new Set(allAlbums.flatMap((album) => albumKeys(album.artist, album.title))), [allAlbums])
  const missing = useMemo(() => {
    if (!details) return null
    const seen = new Set<string>()
    return details.albums
      .filter((item) => {
        const [key] = albumKeys(item.artist, item.title)
        if (known.has(key) || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, MISSING_SIZE)
  }, [details, known])

  return (
    <div className={`genres${genre ? ' has-genre' : ''}`}>
      <section className="genre-ranking" aria-label="Most represented genres">
        <div className="genre-ranking-head">
          <h2>Genres</h2>
          {likes && (
            <div className="view-switch genre-sort" role="group" aria-label="Sort genres">
              <button type="button" aria-pressed={!sortByLikes} onClick={() => setByLikes(false)}>
                Most albums
              </button>
              <button type="button" aria-pressed={sortByLikes} onClick={() => setByLikes(true)}>
                ♥ Your likes
              </button>
            </div>
          )}
        </div>
        <input
          className="search genre-find"
          type="search"
          placeholder="Find a genre"
          aria-label="Find a genre"
          value={find}
          onChange={(event) => setFind(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            const first = shown[0]?.name ?? offTimeline
            if (first) onGenre(first)
          }}
        />
        <ol className="genre-list">
          {shown.map((row) => (
            <li key={row.name}>
              <button
                type="button"
                className="genre-row"
                aria-current={row.name === genre ? 'true' : undefined}
                onClick={() => onGenre(row.name)}
              >
                <span className="genre-name">{genreLabel(row.name)}</span>
                <span className="genre-count">
                  {row.count}
                  {row.liked > 0 && <span className="genre-liked"> ♥{row.liked}</span>}
                </span>
                <span className="genre-bar" style={cssVars({ '--share': row.count / top })} aria-hidden="true" />
              </button>
            </li>
          ))}
          {offTimeline && (
            <li>
              <button type="button" className="genre-row" onClick={() => onGenre(offTimeline)}>
                <span className="genre-name">Explore “{offTimeline}”</span>
                <span className="genre-count">0</span>
              </button>
            </li>
          )}
          {shown.length === 0 && !offTimeline && <li className="field-hint">No genre matches.</li>}
        </ol>
      </section>

      {genre ? (
        <section className="genre-detail" aria-labelledby="genre-title">
          <button type="button" className="text-button genre-back" onClick={() => onGenre(null)}>
            ← All genres
          </button>
          <p className="kicker">Genre</p>
          <h2 id="genre-title">{genreLabel(genre)}</h2>
          <p className="genre-facts">
            {members.length === 0
              ? 'No album on the timeline yet.'
              : `${members.length} ${members.length === 1 ? 'album' : 'albums'} on the timeline, ${members[0].year} to ${members[members.length - 1].year}.`}
            {likedCount > 0 && (
              <>
                {' '}
                <span className="heart-inline">♥</span> {likedCount} by artists you like.
              </>
            )}
          </p>
          {details?.summary && (
            <p className="genre-summary">
              {details.summary}{' '}
              <a href={`https://www.last.fm/tag/${encodeURIComponent(genre)}`} target="_blank" rel="noreferrer">
                More on Last.fm
              </a>
            </p>
          )}

          {members.length > 0 && (
            <>
              <div className="genre-decades" aria-label="Albums per decade">
                {decades.map((item) => (
                  <div
                    key={item.decade}
                    className={`genre-decade${item.count === 0 ? ' is-empty' : ''}`}
                    title={`${item.count} in the ${item.decade}s`}
                  >
                    <span className="genre-decade-bar" style={cssVars({ '--share': item.count / busiest })} />
                    <span className="genre-decade-label">{String(item.decade).slice(2)}s</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="toggle light-up"
                aria-pressed={lit}
                onClick={() => onLight(genre, lit ? null : memberIds)}
              >
                {lit ? 'Turn the lights back on' : `Light up these ${members.length} on the timeline`}
              </button>
              <ul className="genre-albums">
                {members.map((album) => {
                  const albumLikes = likes?.get(album.id)
                  return (
                    <li key={album.id}>
                      <button
                        type="button"
                        className={`genre-album${album.id === selectedId ? ' is-selected' : ''}`}
                        onClick={() => onOpen(album.id)}
                      >
                        {album.spotify?.coverSmall ? (
                          <img src={album.spotify.coverSmall} alt="" loading="lazy" />
                        ) : (
                          <span className="result-blank" />
                        )}
                        <span className="genre-album-title">{album.title}</span>
                        <span className="genre-album-meta">
                          {album.artist} · {album.year}
                        </span>
                        {albumLikes && (
                          <span className="genre-album-heart" aria-label="By an artist you like">
                            ♥{albumLikes.songs.length > 0 && <b>{albumLikes.songs.length}</b>}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {related.length > 0 && (
            <>
              <p className="explore-label">Related genres</p>
              <div className="genre-related">
                {related.map((name) => (
                  <button key={name} type="button" className="genre-tag" onClick={() => onGenre(name)}>
                    {genreLabel(name)}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="explore-label">Popular, not on the timeline yet</p>
          {detailsError && <p className="field-hint">{detailsError}</p>}
          {!missing && !detailsError && <p className="field-hint">Asking Last.fm…</p>}
          {missing && missing.length === 0 && <p className="field-hint">Every popular album is on the timeline.</p>}
          {missing && missing.length > 0 && (
            <ul className="explore-list genre-missing">
              {missing.map((item) => (
                <li key={`${item.artist} ${item.title}`} className="explore-item is-missing">
                  {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="result-blank" />}
                  <span className="result-text">
                    <span className="result-title">{item.title}</span>
                    <span className="result-meta">{item.artist}</span>
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onSuggest(`${item.artist} ${item.title}`)}
                  >
                    {owner ? 'Add' : 'Suggest'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="explore-credit">
            Genres and top albums from{' '}
            <a href="https://www.last.fm" target="_blank" rel="noreferrer">
              Last.fm
            </a>{' '}
            listeners
          </p>
        </section>
      ) : (
        <section className="genre-detail genre-empty">
          <p className="kicker">Genres</p>
          <h2>Pick a genre</h2>
          <p>
            Every record carries the genres Last.fm listeners give it. The list counts how many records of the timeline
            each genre has{likes ? ', and how many are by artists from your liked songs' : ''}. Pick one to see its
            records, the genres around it and its popular albums that are not here yet.
          </p>
        </section>
      )}
    </div>
  )
}
