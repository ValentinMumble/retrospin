import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import { ERAS } from '../eras'
import { buildLayout, measure, spanOf, yearAt, type Layout } from '../layout'
import type { LikesByAlbum } from '../likes'
import { SCENES } from '../scenes'
import { cssVars } from '../style'
import type { Album } from '../types'
import { AlbumCard } from './AlbumCard'
import { MiniMap } from './MiniMap'

export interface TimelineHandle {
  scrollToYear: (year: number) => void
  scrollToAlbum: (id: string, smooth?: boolean) => void
  /** Moves by about two cards, or by most of the screen when `page` is true. */
  step: (direction: 1 | -1, page?: boolean) => void
  scrollToEdge: (edge: 'start' | 'end') => void
}

interface TimelineProps {
  albums: Album[]
  firstYear: number
  lastYear: number
  likes: LikesByAlbum | null
  selectedId: string | null
  onSelect: (id: string) => void
  onCenterYearChange: (year: number) => void
  intro: ReactNode
  outro: ReactNode
  empty: ReactNode
  ref?: Ref<TimelineHandle>
}

function scrollBehavior(smooth = true): ScrollBehavior {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return smooth && !reduced ? 'smooth' : 'auto'
}

const Eras = memo(function Eras({ layout }: { layout: Layout }) {
  return (
    <div className="eras" aria-hidden="true">
      {ERAS.map((era) => {
        const span = spanOf(layout, era.start, era.end)
        if (!span) return null
        return (
          <div
            key={era.label}
            className="era"
            title={`${era.label}, ${era.start} to ${era.end}: ${era.blurb}`}
            style={cssVars(
              { '--era': SCENES[era.scene].color },
              { left: span.left, width: span.width, top: 10 + era.lane * 26 },
            )}
          >
            <span className="era-label">{era.label}</span>
          </div>
        )
      })}
    </div>
  )
})

interface YearBlocksProps {
  layout: Layout
  likes: LikesByAlbum | null
  selectedId: string | null
  onSelect: (id: string) => void
}

const YearBlocks = memo(function YearBlocks({ layout, likes, selectedId, onSelect }: YearBlocksProps) {
  return (
    <div className="years">
      {layout.blocks.map((block, index) => {
        const decadeStart = block.year % 10 === 0 || index === 0
        const classes = ['year', block.year % 10 === 0 ? 'is-decade' : '', block.albums.length ? '' : 'is-empty']
        return (
          <section
            key={block.year}
            className={classes.filter(Boolean).join(' ')}
            style={{ width: block.width }}
            aria-label={String(block.year)}
          >
            <div className="year-head">
              <span className="year-label">{block.year}</span>
            </div>
            {block.albums.length > 0 && (
              <div className="year-grid">
                {block.albums.map((album) => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    likes={likes?.get(album.id)}
                    selected={album.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}
            {decadeStart && (
              <span className="decade-ghost" aria-hidden="true">
                {String(block.year - (block.year % 10)).slice(2)}s
              </span>
            )}
          </section>
        )
      })}
    </div>
  )
})

export function Timeline({
  albums,
  firstYear,
  lastYear,
  likes,
  selectedId,
  onSelect,
  onCenterYearChange,
  intro,
  outro,
  empty,
  ref,
}: TimelineProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight - 180 })
  const [scrollLeft, setScrollLeft] = useState(0)
  const metrics = useMemo(() => measure(viewport.width, viewport.height), [viewport])
  const layout = useMemo(
    () => buildLayout(albums, metrics, firstYear, lastYear),
    [albums, metrics, firstYear, lastYear],
  )

  // Values read by the stable scroll handler.
  const layoutRef = useRef(layout)
  const centerCallback = useRef(onCenterYearChange)
  const anchorYear = useRef<number | null>(null)
  const lastCenter = useRef<number | null>(null)
  const frame = useRef(0)
  useLayoutEffect(() => {
    layoutRef.current = layout
    centerCallback.current = onCenterYearChange
  })

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const observer = new ResizeObserver(() =>
      setViewport({ width: scroller.clientWidth, height: scroller.clientHeight }),
    )
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  // When filters or the window size change the layout, keep the same year in the middle of the screen.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const block = layout.blocks.find((candidate) => candidate.year === anchorYear.current)
    if (scroller && block) scroller.scrollLeft = block.x + block.width / 2 - scroller.clientWidth / 2
  }, [layout])

  const handleScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const scroller = scrollerRef.current
      if (!scroller) return
      setScrollLeft(scroller.scrollLeft)
      const center = yearAt(layoutRef.current, scroller.scrollLeft + scroller.clientWidth / 2)
      anchorYear.current = scroller.scrollLeft < 8 ? null : center
      if (center !== lastCenter.current) {
        lastCenter.current = center
        centerCallback.current(center)
      }
    })
  }, [])

  // Vertical wheel scrolls sideways; mouse drag pans; a drag never counts as a click.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let drag: { pointerId: number; startX: number; startLeft: number; moved: boolean } | null = null
    let swallowClick = false

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? scroller.clientWidth : 1
      scroller.scrollLeft += delta * unit
      event.preventDefault()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      drag = { pointerId: event.pointerId, startX: event.clientX, startLeft: scroller.scrollLeft, moved: false }
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const distance = event.clientX - drag.startX
      if (!drag.moved && Math.abs(distance) > 5) {
        drag.moved = true
        try {
          scroller.setPointerCapture(event.pointerId)
        } catch {
          // The pointer is already gone (released between events): dragging still works without capture.
        }
        scroller.classList.add('is-dragging')
      }
      if (drag.moved) scroller.scrollLeft = drag.startLeft - distance
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      if (drag.moved) {
        swallowClick = true
        window.setTimeout(() => {
          swallowClick = false
        }, 0)
      }
      drag = null
      scroller.classList.remove('is-dragging')
    }
    const onClickCapture = (event: MouseEvent) => {
      if (!swallowClick) return
      event.stopPropagation()
      event.preventDefault()
    }

    scroller.addEventListener('wheel', onWheel, { passive: false })
    scroller.addEventListener('pointerdown', onPointerDown)
    scroller.addEventListener('pointermove', onPointerMove)
    scroller.addEventListener('pointerup', onPointerUp)
    scroller.addEventListener('pointercancel', onPointerUp)
    scroller.addEventListener('click', onClickCapture, true)
    return () => {
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('pointerdown', onPointerDown)
      scroller.removeEventListener('pointermove', onPointerMove)
      scroller.removeEventListener('pointerup', onPointerUp)
      scroller.removeEventListener('pointercancel', onPointerUp)
      scroller.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      scrollToYear(year) {
        const blocks = layout.blocks.filter((block) => block.albums.length > 0)
        const block = blocks.find((candidate) => candidate.year >= year) ?? blocks[blocks.length - 1]
        if (block) scrollerRef.current?.scrollTo({ left: block.x - metrics.gapX, behavior: scrollBehavior() })
      },
      scrollToAlbum(id, smooth = true) {
        const card = scrollerRef.current?.querySelector(`[data-album="${CSS.escape(id)}"]`)
        card?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: scrollBehavior(smooth) })
      },
      step(direction, page = false) {
        const scroller = scrollerRef.current
        if (!scroller) return
        const amount = page ? scroller.clientWidth * 0.85 : (metrics.cardWidth + metrics.gapX) * 2
        scroller.scrollBy({ left: direction * amount, behavior: scrollBehavior() })
      },
      scrollToEdge(edge) {
        scrollerRef.current?.scrollTo({ left: edge === 'start' ? 0 : layout.total, behavior: scrollBehavior() })
      },
    }),
    [layout, metrics],
  )

  const seek = useCallback(
    (fraction: number) => {
      const scroller = scrollerRef.current
      if (scroller) scroller.scrollLeft = fraction * layout.total - scroller.clientWidth / 2
    },
    [layout],
  )

  const style = cssVars({
    '--card-w': `${metrics.cardWidth}px`,
    '--card-h': `${metrics.cardHeight}px`,
    '--gap-x': `${metrics.gapX}px`,
    '--gap-y': `${metrics.gapY}px`,
    '--rows': metrics.rows,
    '--eras-h': `${metrics.erasHeight}px`,
    '--axis-h': `${metrics.axisHeight}px`,
  })

  return (
    <div className="timeline" style={style}>
      <div ref={scrollerRef} className="scroller" onScroll={handleScroll}>
        <div className="track" style={{ width: layout.total }}>
          <Eras layout={layout} />
          <div className="intro" style={{ width: layout.introWidth }}>
            {intro}
            {albums.length === 0 && <div className="empty">{empty}</div>}
          </div>
          <YearBlocks layout={layout} likes={likes} selectedId={selectedId} onSelect={onSelect} />
          <div className="outro" style={{ width: layout.outroWidth }}>
            {outro}
          </div>
        </div>
      </div>
      <MiniMap layout={layout} likes={likes} scrollLeft={scrollLeft} viewportWidth={viewport.width} onSeek={seek} />
    </div>
  )
}
