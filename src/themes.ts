/** Themes are two independent choices: a color palette and a font pairing. Both live in localStorage. */

export interface Palette {
  id: string;
  name: string;
  description: string;
  /** Background, accent and heart colors, for the picker. */
  swatch: [string, string, string];
}

export interface FontPairing {
  id: string;
  name: string;
  description: string;
  /** Google Fonts css2 families, loaded when the pairing is used or previewed. */
  families: string;
  /** Font of the pairing's name in the picker, as a preview. */
  displayFont: string;
}

export const PALETTES: Palette[] = [
  {id: 'vinyl', name: 'Vinyl', description: 'Warm black and gold', swatch: ['#0e0c0a', '#f2c14e', '#ff4f6d']},
  {id: 'espresso', name: 'Espresso', description: 'Cream and oxblood', swatch: ['#15110e', '#e0533d', '#ff6b81']},
  {
    id: 'sunset',
    name: '70s sunset',
    description: 'Brown, orange and mustard',
    swatch: ['#22130c', '#f29e4c', '#e8553f'],
  },
  {
    id: 'neon',
    name: 'Neon 80s',
    description: 'Midnight blue, cyan and magenta',
    swatch: ['#0b0820', '#2de2e6', '#ff3cac'],
  },
  {
    id: 'zine',
    name: 'Punk zine',
    description: 'Black, highlighter and hot pink',
    swatch: ['#0b0b0b', '#f5e663', '#ff2e88'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep green, mint and coral',
    swatch: ['#0c1410', '#7ee0a1', '#ff6f61'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Navy, electric blue and pink',
    swatch: ['#0a0f1c', '#5b9dff', '#ff5c8a'],
  },
];

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'poster',
    name: 'Poster',
    description: 'Anton and Inter',
    families: 'family=Anton&family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500;600;700',
    displayFont: "'Anton', sans-serif",
  },
  {
    id: 'serif',
    name: 'Liner notes',
    description: 'DM Serif Display and Source Serif',
    families:
      'family=DM+Serif+Display&family=JetBrains+Mono:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600',
    displayFont: "'DM Serif Display', serif",
  },
  {
    id: 'groovy',
    name: 'Groovy',
    description: 'Shrikhand and Work Sans',
    families: 'family=DM+Mono:wght@400;500&family=Shrikhand&family=Work+Sans:wght@400;500;600;700',
    displayFont: "'Shrikhand', serif",
  },
  {
    id: 'retro',
    name: 'Retro future',
    description: 'Audiowide and Space Grotesk',
    families: 'family=Audiowide&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700',
    displayFont: "'Audiowide', sans-serif",
  },
  {
    id: 'typewriter',
    name: 'Typewriter',
    description: 'Rubik Mono One and Courier Prime',
    families: 'family=Courier+Prime:wght@400;700&family=Rubik+Mono+One',
    displayFont: "'Rubik Mono One', sans-serif",
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Playfair Display and Karla',
    families: 'family=Fira+Code:wght@400;600&family=Karla:wght@400;500;600;700&family=Playfair+Display:wght@700;900',
    displayFont: "'Playfair Display', serif",
  },
  {
    id: 'signage',
    name: 'Signage',
    description: 'Bungee and Rubik',
    families: 'family=Bungee&family=Roboto+Mono:wght@400;600&family=Rubik:wght@400;500;600;700',
    displayFont: "'Bungee', sans-serif",
  },
];

export const DEFAULT_PALETTE = 'vinyl';
export const DEFAULT_FONTS = 'poster';
const PALETTE_KEY = 'retrospin.palette';
const FONTS_KEY = 'retrospin.font';
/** The single-theme setting of earlier versions, mapped to a palette and a pairing. */
const OLD_THEME_KEY = 'retrospin.theme';
const OLD_THEMES: Record<string, [string, string]> = {
  vinyl: ['vinyl', 'poster'],
  liner: ['espresso', 'serif'],
  sunset: ['sunset', 'groovy'],
  neon: ['neon', 'retro'],
  zine: ['zine', 'typewriter'],
};

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
}

export function storedTheme() {
  const old = OLD_THEMES[read(OLD_THEME_KEY) ?? ''];
  const palette = read(PALETTE_KEY) ?? old?.[0];
  const fonts = read(FONTS_KEY) ?? old?.[1];
  return {
    palette: PALETTES.some(option => option.id === palette) ? (palette as string) : DEFAULT_PALETTE,
    fonts: FONT_PAIRINGS.some(option => option.id === fonts) ? (fonts as string) : DEFAULT_FONTS,
  };
}

export function loadFonts(pairing: FontPairing) {
  const id = `fonts-${pairing.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${pairing.families}&display=swap`;
  document.head.append(link);
}

export function applyTheme(theme: {palette: string; fonts: string}) {
  const root = document.documentElement;
  if (theme.palette === DEFAULT_PALETTE) delete root.dataset.palette;
  else root.dataset.palette = theme.palette;
  if (theme.fonts === DEFAULT_FONTS) delete root.dataset.font;
  else root.dataset.font = theme.fonts;
  const pairing = FONT_PAIRINGS.find(option => option.id === theme.fonts);
  if (pairing) loadFonts(pairing);
  write(PALETTE_KEY, theme.palette);
  write(FONTS_KEY, theme.fonts);
}
