import { useEffect, useRef } from 'react'
import { countryName, flag } from '../countries'
import type { AlbumLikes } from '../likes'
import { SCENES } from '../scenes'
import { cssVars } from '../style'
import type { Album } from '../types'

interface AlbumPanelProps {
  album: Album
  likes: AlbumLikes | undefined
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}

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

export function AlbumPanel({ album, likes, hasPrevious, hasNext, onPrevious, onNext, onClose }: AlbumPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const scene = SCENES[album.scene]

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [album.id])

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
            <span>
              {flag(album.country)} {countryName(album.country)}
            </span>
          )}
          <span className="scene-tag">{scene.label}</span>
        </div>
        <h2 id="panel-title">{album.title}</h2>
        <p className="panel-artist">{album.artist}</p>
        <p className="panel-note">{album.note}</p>

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
            <a className="spotify-link" href={album.spotify.url} target="_blank" rel="noreferrer">
              Open in Spotify
            </a>
          </>
        )}
        <p className="panel-keys">
          <kbd>←</kbd> <kbd>→</kbd> previous and next album, <kbd>Esc</kbd> to close
        </p>
      </aside>
    </>
  )
}
