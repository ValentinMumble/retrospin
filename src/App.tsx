import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlbumPanel } from './components/AlbumPanel'
import { Timeline, type TimelineHandle } from './components/Timeline'
import { countryName, flag } from './countries'
import { catalog, firstYear, lastYear } from './data'
import { matchLikes, type LikesByAlbum } from './likes'
import { SCENES, SCENE_ORDER } from './scenes'
import {
  cachedLikedTracks,
  completeLogin,
  fetchLikedTracks,
  fetchProfile,
  isLoggedIn,
  loginAvailable,
  logout,
  startLogin,
} from './spotify'
import { cssVars } from './style'
import type { SceneKey } from './types'

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]
const LATEST = catalog.albums[catalog.albums.length - 1]
const COUNTRIES = Object.entries(
  catalog.albums.reduce<Record<string, number>>((counts, album) => {
    if (album.country) counts[album.country] = (counts[album.country] ?? 0) + 1
    return counts
  }, {}),
)
  .map(([code, count]) => ({ code, count, name: countryName(code) }))
  .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name))

function fold(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// Started once, outside React, so a double-run effect in development cannot use the login code twice.
const loginFinished = loginAvailable ? completeLogin() : Promise.resolve(false)

function initialLikes() {
  const cached = isLoggedIn() ? cachedLikedTracks() : null
  return cached ? matchLikes(catalog.albums, cached) : null
}

function albumFromHash() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  return catalog.albums.some((album) => album.id === id) ? id : null
}

export default function App() {
  const timelineRef = useRef<TimelineHandle>(null)
  const [query, setQuery] = useState('')
  const [activeScenes, setActiveScenes] = useState<ReadonlySet<SceneKey>>(new Set())
  const [mineOnly, setMineOnly] = useState(false)
  const [country, setCountry] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(albumFromHash)
  const [centerYear, setCenterYear] = useState(firstYear)
  const [likes, setLikes] = useState<LikesByAlbum | null>(initialLikes)
  const [account, setAccount] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [spotifyError, setSpotifyError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const sync = async () => {
      try {
        await loginFinished
        if (!isLoggedIn()) return
        setSyncing(true)
        const [profile, tracks] = await Promise.all([fetchProfile(), fetchLikedTracks()])
        if (cancelled) return
        setAccount(profile.name)
        setLikes(matchLikes(catalog.albums, tracks))
        setSpotifyError(null)
      } catch (error) {
        if (cancelled) return
        setSpotifyError(error instanceof Error ? error.message : String(error))
        if (!isLoggedIn()) setLikes(null)
      } finally {
        if (!cancelled) setSyncing(false)
      }
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [])

  const disconnect = () => {
    logout()
    setLikes(null)
    setAccount(null)
    setMineOnly(false)
  }

  const albums = useMemo(() => {
    const needle = fold(query.trim())
    return catalog.albums.filter(
      (album) =>
        (activeScenes.size === 0 || activeScenes.has(album.scene)) &&
        (!mineOnly || Boolean(likes?.has(album.id))) &&
        (!country || album.country === country) &&
        (!needle || fold(`${album.artist} ${album.title}`).includes(needle)),
    )
  }, [query, activeScenes, mineOnly, country, likes])

  const selected = catalog.albums.find((album) => album.id === selectedId) ?? null
  const selectedIndex = albums.findIndex((album) => album.id === selectedId)

  const step = useCallback(
    (offset: 1 | -1) => {
      const next = albums[selectedIndex + offset]
      if (selectedIndex < 0 || !next) return
      setSelectedId(next.id)
      timelineRef.current?.scrollToAlbum(next.id)
    },
    [albums, selectedIndex],
  )

  const toggleScene = (scene: SceneKey) =>
    setActiveScenes((current) => {
      const next = new Set(current)
      if (next.has(scene)) next.delete(scene)
      else next.add(scene)
      return next
    })

  useEffect(() => {
    const url = selectedId ? `#${selectedId}` : window.location.pathname + window.location.search
    window.history.replaceState(null, '', url)
  }, [selectedId])

  // Opened from a shared link: bring that album into view once the timeline is laid out.
  useEffect(() => {
    const id = albumFromHash()
    if (id) requestAnimationFrame(() => timelineRef.current?.scrollToAlbum(id, false))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        if (event.key === 'Escape') target.blur()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const timeline = timelineRef.current
      if (!timeline) return
      switch (event.key) {
        case 'Escape':
          setSelectedId(null)
          break
        case 'ArrowRight':
          if (selectedId) step(1)
          else timeline.step(1)
          break
        case 'ArrowLeft':
          if (selectedId) step(-1)
          else timeline.step(-1)
          break
        case 'PageDown':
          timeline.step(1, true)
          break
        case 'PageUp':
          timeline.step(-1, true)
          break
        case 'Home':
          timeline.scrollToEdge('start')
          break
        case 'End':
          timeline.scrollToEdge('end')
          break
        case '/':
          document.querySelector<HTMLInputElement>('.search')?.focus()
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, step])

  const filtered = query.trim() !== '' || activeScenes.size > 0 || mineOnly || country !== ''
  const clearFilters = () => {
    setQuery('')
    setActiveScenes(new Set())
    setMineOnly(false)
    setCountry('')
  }
  const currentDecade = centerYear - (centerYear % 10)

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => timelineRef.current?.scrollToEdge('start')}>
          <span className="brand-disc" aria-hidden="true" />
          Retrospin
        </button>
        <nav className="decades" aria-label="Jump to a decade">
          {DECADES.map((decade) => (
            <button
              key={decade}
              type="button"
              className={`decade${decade === currentDecade ? ' is-current' : ''}`}
              aria-current={decade === currentDecade ? 'true' : undefined}
              onClick={() => timelineRef.current?.scrollToYear(decade)}
            >
              {String(decade).slice(2)}s
            </button>
          ))}
        </nav>
        <div className="tools">
          <input
            className="search"
            type="search"
            placeholder="Search artist or album"
            aria-label="Search artist or album"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className={`select${country ? ' is-active' : ''}`}
            aria-label="Filter by country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            <option value="">All countries</option>
            {COUNTRIES.map((option) => (
              <option key={option.code} value={option.code}>
                {flag(option.code)} {option.name} ({option.count})
              </option>
            ))}
          </select>
          {likes ? (
            <>
              <button
                type="button"
                className="toggle"
                aria-pressed={mineOnly}
                onClick={() => setMineOnly((current) => !current)}
                title="Only albums by artists from your Spotify liked songs"
              >
                <span aria-hidden="true">♥</span> My artists
              </button>
              <button type="button" className="account" onClick={disconnect} title="Disconnect Spotify">
                {syncing ? 'Syncing…' : (account ?? 'Spotify')} <span aria-hidden="true">×</span>
              </button>
            </>
          ) : (
            loginAvailable && (
              <button type="button" className="connect" onClick={() => void startLogin()} disabled={syncing}>
                {syncing ? 'Loading your likes…' : 'Connect Spotify'}
              </button>
            )
          )}
        </div>
      </header>

      <div className="scenes" role="group" aria-label="Filter by scene">
        <button
          type="button"
          className="chip chip-all"
          aria-pressed={activeScenes.size === 0}
          onClick={() => setActiveScenes(new Set())}
        >
          All scenes
        </button>
        {SCENE_ORDER.map((scene) => (
          <button
            key={scene}
            type="button"
            className="chip"
            style={cssVars({ '--scene': SCENES[scene].color })}
            aria-pressed={activeScenes.has(scene)}
            onClick={() => toggleScene(scene)}
          >
            {SCENES[scene].label}
          </button>
        ))}
        {spotifyError && <span className="notice">{spotifyError}</span>}
        <span className="result-count">
          {albums.length} of {catalog.albums.length} albums
        </span>
      </div>

      <Timeline
        ref={timelineRef}
        albums={albums}
        likes={likes}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCenterYearChange={setCenterYear}
        intro={
          <>
            <p className="kicker">
              {firstYear} to {lastYear}
            </p>
            <h1>Seventy years of rock records</h1>
            <p>
              <strong>{catalog.albums.length} albums</strong>, from Elvis Presley's first LP to {LATEST.artist}'s{' '}
              <em>{LATEST.title}</em>. Click a record to read about it and play it.
            </p>
            {likes ? (
              <p>
                <span className="heart-inline">♥</span> marks the <strong>{likes.size} albums</strong> by artists from
                your Spotify liked songs. A number on the heart counts your liked songs on that record.
              </p>
            ) : (
              loginAvailable && (
                <p>
                  <button type="button" className="link" onClick={() => void startLogin()}>
                    Connect Spotify
                  </button>{' '}
                  to see which of these records you like. Your liked songs stay in this browser.
                </p>
              )
            )}
            <p className="hint">
              Scroll or drag to travel in time. <kbd>←</kbd> <kbd>→</kbd> step, <kbd>/</kbd> search.
            </p>
            <button type="button" className="go" onClick={() => timelineRef.current?.scrollToYear(firstYear)}>
              Start in {firstYear} <span aria-hidden="true">→</span>
            </button>
          </>
        }
        outro={
          <>
            <p className="kicker">Today</p>
            <h2>To be continued.</h2>
            <p>Refresh the data from Spotify and the records you like next will show up here.</p>
            <button type="button" className="go" onClick={() => timelineRef.current?.scrollToEdge('start')}>
              <span aria-hidden="true">←</span> Back to {firstYear}
            </button>
          </>
        }
        empty={
          <>
            <p>No album matches these filters.</p>
            {filtered && (
              <button type="button" className="go" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </>
        }
      />

      {selected && (
        <AlbumPanel
          album={selected}
          likes={likes?.get(selected.id)}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex >= 0 && selectedIndex < albums.length - 1}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
