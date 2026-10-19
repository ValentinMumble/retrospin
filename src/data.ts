import raw from './data/albums.json'
import type { Catalog } from './types'

/** Built by scripts/build_data.py from scripts/catalog.txt and the Spotify liked songs. */
export const catalog = raw as Catalog

export const firstYear = catalog.albums[0].year
export const lastYear = Math.max(new Date().getFullYear(), catalog.albums[catalog.albums.length - 1].year)
