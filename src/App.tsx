import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAlbums, fetchGalaxyLinks, fetchSuggestions, type GalaxyLink } from './api'
import { AlbumPanel } from './components/AlbumPanel'
import { ReviewDialog } from './components/ReviewDialog'
import { SuggestDialog } from './components/SuggestDialog'
import { ThemePicker } from './components/ThemePicker'
import { Galaxy } from './components/Galaxy'
import { GenresView } from './components/GenresView'
import { Timeline, type TimelineHandle } from './components/Timeline'
import { countryName, flag } from './countries'
import { genreLabel } from './genres'
import { matchLikes } from './likes'
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
  type LikedTrack,
} from './spotify'
import { cssVars } from './style'
import type { Album, SceneKey } from './types'

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]
const FIRST_YEAR = 1955
const CURRENT_YEAR = new Date().getFullYear()

function fold(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// Started once, outside React, so a double-run effect in development cannot use the login code twice.
const loginFinished = loginAvailable ? completeLogin() : Promise.resolve(false)

function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

type View = 'timeline' | 'galaxy' | 'genres'

function readStored(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
}

function sortAlbums(albums: Album[]) {
  return [...albums].sort(
    (first, second) => first.date.localeCompare(second.date) || first.artist.localeCompare(second.artist),
  )
}

export default function App() {
  const timelineRef = useRef<TimelineHandle>(null)
  const [allAlbums, setAllAlbums] = useState<Album[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [activeScenes, setActiveScenes] = useState<ReadonlySet<SceneKey>>(new Set())
  const [mineOnly, setMineOnly] = useState(false)
  const [activeCountries, setActiveCountries] = useState<ReadonlySet<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(
    () => decodeURIComponent(window.location.hash.slice(1)) || null,
  )
  const [centerYear, setCenterYear] = useState(FIRST_YEAR)
  const [likedTracks, setLikedTracks] = useState<LikedTrack[] | null>(() => (isLoggedIn() ? cachedLikedTracks() : null))
  const [account, setAccount] = useState<string | null>(null)
  const [owner, setOwner] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [spotifyError, setSpotifyError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'suggest' | 'review' | null>(null)
  /** On phones the scene and country filters fold away behind a Filters button. */
  const [filtersOpen, setFiltersOpen] = useState(false)
  /**
   * Only these albums stay bright. "Light up related" in an album's Explore section belongs to that album
   * (seedId); a genre's light-up (genre) stays on while other albums open, until turned off.
   */
  const [lit, setLit] = useState<{ seedId: string | null; genre: string | null; ids: ReadonlySet<string> } | null>(null)
  const [suggestQuery, setSuggestQuery] = useState('')
  const [view, setView] = useState<View>(() => {
    const stored = readStored('retrospin.view')
    return stored === 'galaxy' || stored === 'genres' ? stored : 'timeline'
  })
  const [genre, setGenre] = useState<string | null>(() => readStored('retrospin.genre'))
  const [galaxyLinks, setGalaxyLinks] = useState<GalaxyLink[] | null>(null)
  const [galaxyError, setGalaxyError] = useState<string | null>(null)

  const changeView = (next: View) => {
    setView(next)
    writeStored('retrospin.view', next)
  }
  const changeGenre = (next: string | null) => {
    setGenre(next)
    writeStored('retrospin.genre', next)
  }
  /** From a genre tag in the album panel: show that genre in the Genres view. */
  const openGenre = (next: string) => {
    changeGenre(next)
    changeView('genres')
    setSelectedId(null)
  }

  // The galaxy's links load the first time it is shown.
  useEffect(() => {
    if (view !== 'galaxy' || galaxyLinks || galaxyError) return
    const load = async () => {
      try {
        setGalaxyLinks(await fetchGalaxyLinks())
      } catch (error) {
        setGalaxyError(error instanceof Error ? error.message : String(error))
      }
    }
    void load()
  }, [view, galaxyLinks, galaxyError])

  const loadAlbums = useCallback(async () => {
    try {
      setAllAlbums(sortAlbums(await fetchAlbums()))
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    // The state changes once the fetch answers, not synchronously in the effect.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadAlbums()
  }, [loadAlbums])

  useEffect(() => {
    let cancelled = false
    const sync = async () => {
      try {
        await loginFinished
        if (!isLoggedIn()) return
        setSyncing(true)
        // Only the site owner may read the review queue: a refusal just means a regular visitor.
        // Checked at once, so the owner's Add button shows without waiting for the liked songs.
        const checkOwner = async () => {
          const suggestions = await fetchSuggestions().catch(() => null)
          if (!cancelled && suggestions) {
            setOwner(true)
            setPendingCount(suggestions.length)
          }
        }
        void checkOwner()
        const [profile, tracks] = await Promise.all([fetchProfile(), fetchLikedTracks()])
        if (cancelled) return
        setAccount(profile.name)
        setLikedTracks(tracks)
        setSpotifyError(null)
      } catch (error) {
        if (cancelled) return
        setSpotifyError(error instanceof Error ? error.message : String(error))
        if (!isLoggedIn()) setLikedTracks(null)
      } finally {
        if (!cancelled) setSyncing(false)
      }
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [])

  const likes = useMemo(
    () => (likedTracks && allAlbums.length ? matchLikes(allAlbums, likedTracks) : null),
    [allAlbums, likedTracks],
  )

  const disconnect = () => {
    logout()
    setLikedTracks(null)
    setAccount(null)
    setOwner(false)
    setMineOnly(false)
  }

  const years = useMemo(() => {
    const albumYears = allAlbums.map((album) => album.year)
    return {
      first: Math.min(FIRST_YEAR, ...albumYears),
      last: Math.max(CURRENT_YEAR, ...albumYears),
    }
  }, [allAlbums])

  const countries = useMemo(
    () =>
      Object.entries(
        allAlbums.reduce<Record<string, number>>((counts, album) => {
          if (album.country) counts[album.country] = (counts[album.country] ?? 0) + 1
          return counts
        }, {}),
      )
        .map(([code, count]) => ({ code, count, name: countryName(code) }))
        .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name)),
    [allAlbums],
  )

  const albums = useMemo(() => {
    return allAlbums.filter(
      (album) =>
        (activeScenes.size === 0 || activeScenes.has(album.scene)) &&
        (!mineOnly || Boolean(likes?.has(album.id))) &&
        (activeCountries.size === 0 || (album.country !== null && activeCountries.has(album.country))),
    )
  }, [allAlbums, activeScenes, mineOnly, activeCountries, likes])

  const selected = allAlbums.find((album) => album.id === selectedId) ?? null
  // An album's light-up belongs to it: opening another album or closing the panel ends it.
  const litIds = lit && (lit.seedId === null || lit.seedId === selectedId) ? lit.ids : null
  const litGenre = lit?.genre ?? null
  // Search highlights instead of hiding: matching albums stay bright, the others dim.
  const needle = fold(query.trim())
  const matchList = useMemo(
    () => (needle ? albums.filter((album) => fold(`${album.artist} ${album.title}`).includes(needle)) : null),
    [albums, needle],
  )
  const matches = useMemo(() => (matchList ? new Set(matchList.map((album) => album.id)) : null), [matchList])
  const highlighted = litIds ?? matches
  const firstMatchId = matchList?.[0]?.id ?? null

  // While typing, glide the timeline to the first match.
  useEffect(() => {
    if (!firstMatchId) return
    const timer = window.setTimeout(() => timelineRef.current?.scrollToAlbum(firstMatchId), 350)
    return () => window.clearTimeout(timer)
  }, [firstMatchId])

  /** Enter in the search box opens the next match (Shift+Enter the previous one). */
  const stepMatch = (direction: 1 | -1) => {
    if (!matchList?.length) return
    const index = matchList.findIndex((album) => album.id === selectedId)
    const nextIndex =
      index < 0
        ? direction === 1
          ? 0
          : matchList.length - 1
        : (index + direction + matchList.length) % matchList.length
    const next = matchList[nextIndex]
    setSelectedId(next.id)
    timelineRef.current?.scrollToAlbum(next.id)
  }
  const selectedIndex = albums.findIndex((album) => album.id === selectedId)
  const latest = allAlbums[allAlbums.length - 1]

  const step = useCallback(
    (offset: 1 | -1) => {
      const next = albums[selectedIndex + offset]
      if (selectedIndex < 0 || !next) return
      setSelectedId(next.id)
      timelineRef.current?.scrollToAlbum(next.id)
    },
    [albums, selectedIndex],
  )

  const toggleScene = (scene: SceneKey) => setActiveScenes((current) => toggled(current, scene))
  /** From the album panel: show only that scene (or every scene again if it was the only one). */
  const only = <T,>(current: ReadonlySet<T>, value: T): ReadonlySet<T> =>
    current.size === 1 && current.has(value) ? new Set() : new Set([value])
  const keepSelectedInView = () => {
    const id = selectedId
    if (id) requestAnimationFrame(() => requestAnimationFrame(() => timelineRef.current?.scrollToAlbum(id)))
  }
  const toggleCountry = (code: string) => setActiveCountries((current) => toggled(current, code))

  const addAlbum = useCallback((album: Album) => {
    setAllAlbums((current) => sortAlbums([...current.filter((item) => item.id !== album.id), album]))
  }, [])

  useEffect(() => {
    if (loadState !== 'ready') return
    const url = selectedId ? `#${selectedId}` : window.location.pathname + window.location.search
    window.history.replaceState(null, '', url)
  }, [selectedId, loadState])

  // Opened from a shared link: once the albums are in, bring that album into view. An unknown id opens nothing.
  const openedFromLink = useRef(false)
  useEffect(() => {
    if (loadState !== 'ready' || openedFromLink.current) return
    openedFromLink.current = true
    if (selectedId && allAlbums.some((album) => album.id === selectedId)) {
      requestAnimationFrame(() => timelineRef.current?.scrollToAlbum(selectedId, false))
    }
  }, [loadState, allAlbums, selectedId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
        if (event.key === 'Escape') target.blur()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const timeline = timelineRef.current
      if (!timeline) return
      switch (event.key) {
        case 'Escape':
          // An album's light-up goes first, then the album, then a genre's light-up.
          if (litIds && !litGenre) setLit(null)
          else if (selectedId) setSelectedId(null)
          else setLit(null)
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
          document.querySelector<HTMLInputElement>('.topbar .search')?.focus()
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, step, litIds, litGenre])

  const filtered = activeScenes.size > 0 || mineOnly || activeCountries.size > 0
  const activeFilterCount = activeScenes.size + activeCountries.size + (mineOnly ? 1 : 0)
  const openSuggest = (search = '') => {
    setSuggestQuery(search)
    setDialog('suggest')
  }
  /** From the Genres view: light the genre's albums up on the timeline and travel to the first one. */
  const lightGenre = (name: string, ids: ReadonlySet<string> | null) => {
    if (!ids) {
      setLit(null)
      return
    }
    setLit({ seedId: null, genre: name, ids })
    changeView('timeline')
    const first = albums.find((album) => ids.has(album.id))
    if (first) requestAnimationFrame(() => requestAnimationFrame(() => timelineRef.current?.scrollToAlbum(first.id)))
  }
  /** From Explore: open a related album, clearing filters that would hide it. */
  const jumpTo = (id: string) => {
    if (!albums.some((album) => album.id === id)) clearFilters()
    setSelectedId(id)
    requestAnimationFrame(() => requestAnimationFrame(() => timelineRef.current?.scrollToAlbum(id)))
  }
  const clearFilters = () => {
    setQuery('')
    setActiveScenes(new Set())
    setMineOnly(false)
    setActiveCountries(new Set())
  }
  const currentDecade = centerYear - (centerYear % 10)

  return (
    <div className={`app${filtersOpen ? ' filters-open' : ''}`}>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => timelineRef.current?.scrollToEdge('start')}>
          <span className="brand-disc" aria-hidden="true" />
          Retrospin
        </button>
        <nav className="decades" aria-label="Jump to a decade" hidden={view !== 'timeline'}>
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
        <div className="finder">
          <input
            className="search"
            type="search"
            placeholder="Search artist or album"
            aria-label="Search artist or album"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              stepMatch(event.shiftKey ? -1 : 1)
            }}
          />
          <button
            type="button"
            className="toggle filters-button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters{activeFilterCount > 0 && <b className="count-badge">{activeFilterCount}</b>}
          </button>
          <div className="view-switch" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={view === 'timeline'}
              aria-label="Timeline"
              title="Timeline"
              onClick={() => changeView('timeline')}
            >
              <span aria-hidden="true">↔</span>
              <span className="wide-label"> Timeline</span>
            </button>
            <button
              type="button"
              aria-pressed={view === 'galaxy'}
              aria-label="Galaxy"
              title="Galaxy"
              onClick={() => changeView('galaxy')}
            >
              <span aria-hidden="true">✦</span>
              <span className="wide-label"> Galaxy</span>
            </button>
            <button
              type="button"
              aria-pressed={view === 'genres'}
              aria-label="Genres"
              title="Genres"
              onClick={() => changeView('genres')}
            >
              <span aria-hidden="true">≡</span>
              <span className="wide-label"> Genres</span>
            </button>
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="toggle"
            onClick={() => openSuggest()}
            aria-label={owner ? 'Add an album' : 'Suggest an album'}
            title={owner ? 'Add an album' : 'Suggest an album'}
          >
            <span aria-hidden="true">+</span>
            <span className="wide-label">{owner ? ' Add' : ' Suggest'}</span>
          </button>
          {owner && (
            <button type="button" className="toggle" onClick={() => setDialog('review')}>
              Review{pendingCount > 0 && <b className="count-badge">{pendingCount}</b>}
            </button>
          )}
          {likes ? (
            <>
              <button
                type="button"
                className="toggle"
                aria-pressed={mineOnly}
                aria-label="Only my artists"
                onClick={() => setMineOnly((current) => !current)}
                title="Only albums by artists from your Spotify liked songs"
              >
                <span aria-hidden="true">♥</span>
                <span className="wide-label"> My artists</span>
              </button>
              <button type="button" className="account" onClick={disconnect} title="Disconnect Spotify">
                <span className="wide-label">{syncing ? 'Syncing…' : (account ?? 'Spotify')} </span>
                <span aria-hidden="true">×</span>
              </button>
            </>
          ) : (
            loginAvailable && (
              <button type="button" className="connect" onClick={() => void startLogin()} disabled={syncing}>
                {syncing ? (
                  'Loading…'
                ) : (
                  <>
                    <span className="wide-label">Connect </span>Spotify
                  </>
                )}
              </button>
            )
          )}
          <ThemePicker />
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
          {matches
            ? `${matches.size} ${matches.size === 1 ? 'match' : 'matches'}${matches.size > 0 ? ', Enter to step through' : ''}`
            : `${albums.length} of ${allAlbums.length} albums`}
        </span>
      </div>

      <div className="scenes countries" role="group" aria-label="Filter by country">
        <button
          type="button"
          className="chip chip-all"
          aria-pressed={activeCountries.size === 0}
          onClick={() => setActiveCountries(new Set())}
        >
          All countries
        </button>
        {countries.map((option) => (
          <button
            key={option.code}
            type="button"
            className="chip chip-country"
            aria-pressed={activeCountries.has(option.code)}
            onClick={() => toggleCountry(option.code)}
          >
            <span aria-hidden="true">{flag(option.code)}</span> {option.name}
            <span className="chip-count">{option.count}</span>
          </button>
        ))}
      </div>

      {litGenre && (
        <p className="lit-bar">
          <span>
            Lighting up the {lit?.ids.size} <strong>{genreLabel(litGenre)}</strong> records
          </span>
          <button type="button" className="text-button" onClick={() => setLit(null)}>
            Turn the lights back on
          </button>
        </p>
      )}

      <Timeline
        ref={timelineRef}
        hidden={view !== 'timeline'}
        albums={albums}
        firstYear={years.first}
        lastYear={years.last}
        likes={likes}
        lit={highlighted}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCenterYearChange={setCenterYear}
        intro={
          <>
            <p className="kicker">
              {years.first} to {years.last}
            </p>
            <h1>Seventy years of rock records</h1>
            <p>
              {latest ? (
                <>
                  <strong>{allAlbums.length} albums</strong>, from Elvis Presley's first LP to {latest.artist}'s{' '}
                  <em>{latest.title}</em>.
                </>
              ) : (
                'Rock albums from Elvis Presley to today.'
              )}{' '}
              Click a record to read about it and play it.
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
              <span className="hint-keys">
                Scroll or drag to travel in time. <kbd>←</kbd> <kbd>→</kbd> step, <kbd>/</kbd> search.
              </span>
              <span className="hint-touch">Swipe sideways to travel in time.</span>
            </p>
            <button type="button" className="go" onClick={() => timelineRef.current?.scrollToYear(years.first)}>
              Start in {years.first} <span aria-hidden="true">→</span>
            </button>
          </>
        }
        outro={
          <>
            <p className="kicker">Today</p>
            <h2>To be continued.</h2>
            <p>
              {owner
                ? 'Missing a record that belongs here? Add it, it goes straight onto the timeline.'
                : 'Missing a record that belongs here? Suggest it, and it joins the timeline once reviewed.'}
            </p>
            <button type="button" className="go" onClick={() => openSuggest()}>
              {owner ? 'Add an album' : 'Suggest an album'}
            </button>
          </>
        }
        empty={
          loadState === 'loading' ? (
            <p>Loading the albums…</p>
          ) : loadState === 'error' ? (
            <>
              <p>The albums could not be loaded.</p>
              <button
                type="button"
                className="go"
                onClick={() => {
                  setLoadState('loading')
                  void loadAlbums()
                }}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <p>No album matches these filters.</p>
              {filtered && (
                <button type="button" className="go" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </>
          )
        }
      />

      {view === 'galaxy' && (
        <Galaxy
          albums={albums}
          links={galaxyLinks}
          linksError={galaxyError}
          likes={likes}
          selectedId={selectedId}
          lit={highlighted}
          panelOpen={selected !== null}
          firstYear={years.first}
          lastYear={years.last}
          onSelect={setSelectedId}
        />
      )}

      {view === 'genres' && (
        <GenresView
          albums={albums}
          allAlbums={allAlbums}
          likes={likes}
          genre={genre}
          owner={owner}
          litGenre={litGenre}
          selectedId={selectedId}
          onGenre={changeGenre}
          onOpen={setSelectedId}
          onLight={lightGenre}
          onSuggest={openSuggest}
        />
      )}

      {selected && (
        <AlbumPanel
          album={selected}
          likes={likes?.get(selected.id)}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex >= 0 && selectedIndex < albums.length - 1}
          sceneActive={activeScenes.size === 1 && activeScenes.has(selected.scene)}
          countryActive={
            selected.country !== null && activeCountries.size === 1 && activeCountries.has(selected.country)
          }
          onFilterScene={() => {
            setActiveScenes((current) => only(current, selected.scene))
            keepSelectedInView()
          }}
          onFilterCountry={() => {
            const country = selected.country
            if (!country) return
            setActiveCountries((current) => only(current, country))
            keepSelectedInView()
          }}
          allAlbums={allAlbums}
          owner={owner}
          lit={lit?.seedId === selected.id}
          onGenre={openGenre}
          onJump={jumpTo}
          onSuggest={openSuggest}
          onLight={(ids) => setLit(ids ? { seedId: selected.id, genre: null, ids } : null)}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {dialog === 'suggest' && (
        <SuggestDialog
          key={suggestQuery}
          owner={owner}
          initialQuery={suggestQuery}
          onClose={() => setDialog(null)}
          onPublished={addAlbum}
        />
      )}
      {dialog === 'review' && (
        <ReviewDialog onClose={() => setDialog(null)} onPublished={addAlbum} onCountChange={setPendingCount} />
      )}
    </div>
  )
}
