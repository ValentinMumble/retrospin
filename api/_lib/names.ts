/** Name cleanup, the same rules as scripts/build_data.py and src/likes.ts. */

const EXTRA_WORDS =
  /remaster|deluxe|edition|anniversary|expanded|version|mono|stereo|bonus|legacy|collector|super|reissue|definitive|feat\.|with /i
const SUFFIX = /\s+-\s+.*\b(remaster\w*|edition|version|anniversary|mono|stereo|live|mix|edit)\b.*$/i

export function tidy(name: string) {
  return name
    .replace(/\s*[([][^)\]]*[)\]]/g, (match) => (EXTRA_WORDS.test(match) ? '' : match))
    .replace(SUFFIX, '')
    .replace(/\s+(\d+(st|nd|rd|th)\s+)?(anniversary|deluxe|expanded|remastered)\b.*$/i, '')
    .trim()
}

export function normalize(text: string) {
  return tidy(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
}

export function slug(text: string) {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
