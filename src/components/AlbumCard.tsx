import { memo } from 'react'
import type { AlbumLikes } from '../likes'
import { SCENES } from '../scenes'
import { cssVars } from '../style'
import type { Album } from '../types'

interface AlbumCardProps {
  album: Album
  likes: AlbumLikes | undefined
  selected: boolean
  dimmed: boolean
  onSelect: (id: string) => void
}

function heartTitle(album: Album, likes: AlbumLikes) {
  const songs = likes.songs.length
  if (songs > 0) return `${songs} of your liked ${songs === 1 ? 'song is' : 'songs are'} on this album`
  return `You like ${likes.artistLikes} ${likes.artistLikes === 1 ? 'song' : 'songs'} by ${album.artist}`
}

export const AlbumCard = memo(function AlbumCard({ album, likes, selected, dimmed, onSelect }: AlbumCardProps) {
  const cover = album.spotify?.coverSmall
  return (
    <button
      type="button"
      className={`card${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
      data-album={album.id}
      style={cssVars({ '--scene': SCENES[album.scene].color })}
      onClick={() => onSelect(album.id)}
      aria-label={`${album.title} by ${album.artist}, ${album.year}`}
    >
      <span className="card-art">
        <span className="vinyl" aria-hidden="true" />
        <span className="sleeve">
          {cover ? (
            <img src={cover} alt="" loading="lazy" decoding="async" draggable={false} />
          ) : (
            <span className="sleeve-blank">{album.title}</span>
          )}
        </span>
        {likes && (
          <span className={`heart${likes.songs.length ? ' has-songs' : ''}`} title={heartTitle(album, likes)}>
            ♥{likes.songs.length > 0 && <b>{likes.songs.length}</b>}
          </span>
        )}
      </span>
      <span className="card-title">{album.title}</span>
      <span className="card-artist">{album.artist}</span>
    </button>
  )
})
