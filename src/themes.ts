export interface Theme {
  id: string
  name: string
  description: string
  /** Google Fonts css2 families for this theme, loaded when the theme is shown. */
  fonts: string
  /** Font of the theme's name in the picker, as a preview. */
  displayFont: string
  swatch: [string, string, string]
}

export const THEMES: Theme[] = [
  {
    id: 'vinyl',
    name: 'Vinyl',
    description: 'Warm black and gold, Anton',
    fonts: 'family=Anton&family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500;600;700',
    displayFont: "'Anton', sans-serif",
    swatch: ['#0e0c0a', '#f2c14e', '#ff4f6d'],
  },
  {
    id: 'liner',
    name: 'Liner notes',
    description: 'Espresso, cream and oxblood, serif',
    fonts:
      'family=DM+Serif+Display&family=JetBrains+Mono:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600',
    displayFont: "'DM Serif Display', serif",
    swatch: ['#15110e', '#f1e8d8', '#e0533d'],
  },
  {
    id: 'sunset',
    name: '70s sunset',
    description: 'Brown, orange and mustard, Shrikhand',
    fonts: 'family=DM+Mono:wght@400;500&family=Shrikhand&family=Work+Sans:wght@400;500;600;700',
    displayFont: "'Shrikhand', serif",
    swatch: ['#22130c', '#f29e4c', '#e8553f'],
  },
  {
    id: 'neon',
    name: 'Neon 80s',
    description: 'Midnight blue, magenta and cyan, Audiowide',
    fonts: 'family=Audiowide&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700',
    displayFont: "'Audiowide', sans-serif",
    swatch: ['#0b0820', '#2de2e6', '#ff3cac'],
  },
  {
    id: 'zine',
    name: 'Punk zine',
    description: 'Black, hot pink and highlighter yellow, typewriter',
    fonts: 'family=Courier+Prime:wght@400;700&family=Rubik+Mono+One',
    displayFont: "'Rubik Mono One', sans-serif",
    swatch: ['#0b0b0b', '#f5e663', '#ff2e88'],
  },
]

const STORAGE_KEY = 'retrospin.theme'
export const DEFAULT_THEME = 'vinyl'

export function loadFonts(theme: Theme) {
  const id = `fonts-${theme.id}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${theme.fonts}&display=swap`
  document.head.append(link)
}

export function storedTheme() {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    return THEMES.some((theme) => theme.id === id) ? (id as string) : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(id: string) {
  const theme = THEMES.find((candidate) => candidate.id === id) ?? THEMES[0]
  loadFonts(theme)
  if (theme.id === DEFAULT_THEME) delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme.id
  try {
    localStorage.setItem(STORAGE_KEY, theme.id)
  } catch {
    // Storage blocked: the theme just won't be remembered.
  }
}
