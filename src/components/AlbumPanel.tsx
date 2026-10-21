import { useEffect, useRef } from 'react'
import { countryName, flag } from '../countries'
import { albumGenres, genreLabel } from '../genres'
import type { AlbumLikes } from '../likes'
import { SCENES } from '../scenes'
import { cssVars } from '../style'
import type { Album } from '../types'
import { ExploreSection } from './ExploreSection'

interface AlbumPanelProps {
  album: Album
  likes: AlbumLikes | undefined
  hasPrevious: boolean
  hasNext: boolean
  /** True when the timeline shows only this album's scene (or country). */
  sceneActive: boolean
  countryActive: boolean
  onFilterScene: () => void
  onFilterCountry: () => void
  /** For the Explore section: every album, who is looking, and the light-up state. */
  allAlbums: Album[]
  owner: boolean
  lit: boolean
  onGenre: (genre: string) => void
  onJump: (id: string) => void
  onSuggest: (query: string) => void
  onLight: (ids: ReadonlySet<string> | null) => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}

/**
 * Phones and tablets open open.spotify.com links in the Spotify app by themselves. Computers open them in the
 * web player, so there the main link uses the spotify: address, which the desktop app answers.
 */
const TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches

function formatDate(date: string) {
  if (date.length !== 10) return date
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function AlbumPanel({
  album,
  likes,
  hasPrevious,
  hasNext,
  sceneActive,
  countryActive,
  onFilterScene,
  onFilterCountry,
  allAlbums,
  owner,
  lit,
  onGenre,
  onJump,
  onSuggest,
  onLight,
  onPrevious,
  onNext,
  onClose,
}: AlbumPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const scene = SCENES[album.scene]
  const genres = albumGenres(album)

  useEffect(() => {
    // Opened from the search box (Enter steps through matches): leave the focus there.
    if (document.activeElement?.closest('.search')) return
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [album.id])

  // A click outside the panel closes it, except on an album, which opens that album instead, and in a dialog
  // opened from the panel (adding an album from Explore).
  // Listening in the bubble phase means a drag on the timeline (whose click is swallowed) never closes it.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (panelRef.current?.contains(target) || target.closest('.card, .galaxy-star, .genre-album, .dialog-backdrop')) {
        return
      }
      onCloseRef.current()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside ref={panelRef} className="panel" aria-labelledby="panel-title" style={cssVars({ '--scene': scene.color })}>
        <div className="panel-nav">
          <div className="panel-steps">
            <button
              type="button"
              className="round"
              onClick={onPrevious}
              disabled={!hasPrevious}
              aria-label="Previous album"
            >
              ‹
            </button>
            <button type="button" className="round" onClick={onNext} disabled={!hasNext} aria-label="Next album">
              ›
            </button>
          </div>
          <button ref={closeRef} type="button" className="round" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="panel-cover">
          {album.spotify?.cover ? (
            <img src={album.spotify.cover} alt={`Cover of ${album.title}`} />
          ) : (
            <span className="sleeve-blank">{album.title}</span>
          )}
        </div>

        <div className="panel-meta">
          <span>{formatDate(album.date)}</span>
          {album.country && (
            <button
              type="button"
              className="country-tag"
              aria-pressed={countryActive}
              title={countryActive ? 'Show every country' : `Show only ${countryName(album.country)}`}
              onClick={onFilterCountry}
            >
              {flag(album.country)} {countryName(album.country)}
            </button>
          )}
          <button
            type="button"
            className="scene-tag"
            aria-pressed={sceneActive}
            title={sceneActive ? 'Show every scene' : `Show only ${scene.label}`}
            onClick={onFilterScene}
          >
            {scene.label}
          </button>
        </div>
        <h2 id="panel-title">{album.title}</h2>
        <p className="panel-artist">{album.artist}</p>
        <p className="panel-note">{album.note}</p>
        {genres.length > 0 && (
          <div className="panel-genres" role="group" aria-label="Genres">
            {genres.map((name) => (
              <button
                key={name}
                type="button"
                className="genre-tag"
                title={`Explore ${genreLabel(name)}`}
                onClick={() => onGenre(name)}
              >
                {genreLabel(name)}
              </button>
            ))}
          </div>
        )}

        {likes && (
          <div className="panel-liked">
            <h3>In your liked songs</h3>
            {likes.songs.length > 0 && (
              <ul>
                {likes.songs.map((song) => (
                  <li key={song}>{song}</li>
                ))}
              </ul>
            )}
            <p>
              You have liked {plural(likes.artistLikes, 'song')} by {album.artist}
              {likes.songs.length > 0 ? ' in total.' : ', none from this album yet.'}
            </p>
          </div>
        )}

        {album.spotify && (
          <>
            <iframe
              key={album.spotify.id}
              className="embed"
              title={`${album.title} on Spotify`}
              src={`https://open.spotify.com/embed/album/${album.spotify.id}?utm_source=generator&theme=0`}
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            />
            {TOUCH_DEVICE ? (
              <p className="spotify-links">
                <a className="spotify-link" href={album.spotify.url} target="_blank" rel="noreferrer">
                  Open in Spotify
                </a>
              </p>
            ) : (
              <p className="spotify-links">
                <a className="spotify-link" href={`spotify:album:${album.spotify.id}`}>
                  Open in Spotify app
                </a>
                <a className="spotify-web" href={album.spotify.url} target="_blank" rel="noreferrer">
                  web player
                </a>
              </p>
            )}
          </>
        )}
        <ExploreSection
          key={album.id}
          album={album}
          allAlbums={allAlbums}
          owner={owner}
          lit={lit}
          onJump={onJump}
          onSuggest={onSuggest}
          onLight={onLight}
        />
        <p className="panel-keys">
          <kbd>←</kbd> <kbd>→</kbd> previous and next album, <kbd>Esc</kbd> to close
        </p>
      </aside>
    </>
  )
}
