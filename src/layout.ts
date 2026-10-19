import type { Album } from './types'

export interface Metrics {
  compact: boolean
  cardWidth: number
  cardHeight: number
  gapX: number
  gapY: number
  rows: number
  erasHeight: number
  axisHeight: number
  introWidth: number
  outroWidth: number
  emptyWidth: number
}

export interface YearBlock {
  year: number
  albums: Album[]
  /** Left edge in the scrolling track, in pixels. */
  x: number
  width: number
}

export interface Layout {
  blocks: YearBlock[]
  total: number
  introWidth: number
  outroWidth: number
}

const TEXT_HEIGHT = 62

/** Card size and number of rows that fit the visible timeline area. */
export function measure(width: number, height: number): Metrics {
  const compact = width < 640
  const gapX = compact ? 14 : 22
  const gapY = compact ? 14 : 20
  const erasHeight = 66
  const axisHeight = compact ? 40 : 46
  const available = height - erasHeight - axisHeight - 12
  let cardWidth = compact ? 128 : 164
  if (available < cardWidth + TEXT_HEIGHT) cardWidth = Math.max(96, available - TEXT_HEIGHT)
  const cardHeight = cardWidth + TEXT_HEIGHT
  const rows = Math.min(5, Math.max(1, Math.floor((available + gapY) / (cardHeight + gapY))))
  return {
    compact,
    cardWidth,
    cardHeight,
    gapX,
    gapY,
    rows,
    erasHeight,
    axisHeight,
    introWidth: compact ? Math.min(width, 340) : 460,
    outroWidth: compact ? Math.min(width, 320) : 420,
    emptyWidth: compact ? 40 : 48,
  }
}

/** One block per year, wide enough for its albums stacked in `rows` rows. Empty years stay narrow. */
export function buildLayout(albums: Album[], metrics: Metrics, firstYear: number, lastYear: number): Layout {
  const byYear = new Map<number, Album[]>()
  for (const album of albums) byYear.set(album.year, [...(byYear.get(album.year) ?? []), album])
  const blocks: YearBlock[] = []
  let x = metrics.introWidth
  for (let year = firstYear; year <= lastYear; year += 1) {
    const yearAlbums = byYear.get(year) ?? []
    const columns = Math.ceil(yearAlbums.length / metrics.rows)
    const width = columns ? columns * (metrics.cardWidth + metrics.gapX) : metrics.emptyWidth
    blocks.push({ year, albums: yearAlbums, x, width })
    x += width
  }
  return { blocks, total: x + metrics.outroWidth, introWidth: metrics.introWidth, outroWidth: metrics.outroWidth }
}

export function yearAt(layout: Layout, x: number): number {
  let found = layout.blocks[0]
  for (const block of layout.blocks) {
    if (block.x > x) break
    found = block
  }
  return found.year
}

export function spanOf(layout: Layout, start: number, end: number) {
  const inRange = layout.blocks.filter((block) => block.year >= start && block.year <= end)
  if (inRange.length === 0) return null
  const first = inRange[0]
  const last = inRange[inRange.length - 1]
  return { left: first.x + 4, width: last.x + last.width - first.x - 8 }
}
