import { currentAccessToken } from './spotify'
import type { Album, SceneKey } from './types'

// Query values use encodeURIComponent (spaces as %20): a "+" for a space does not survive every proxy.
async function request<T>(path: string, init: RequestInit = {}, withLogin = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (withLogin) {
    const token = await currentAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(path, { ...init, headers })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (data as { error?: string }).error
    throw new Error(message ?? `The server answered ${response.status}`)
  }
  return data as T
}

export async function fetchAlbums() {
  return (await request<{ albums: Album[] }>('/api/albums')).albums
}

export interface SearchResult {
  spotifyId: string
  title: string
  artist: string
  year: number | null
  type: string
  cover: string | null
  status: 'published' | 'pending' | null
}

export async function searchAlbums(query: string) {
  return (await request<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query)}`)).results
}

export function suggestAlbum(input: { spotifyId: string; note: string; year: number | null }) {
  return request<{ status: 'published' | 'pending'; album: Album }>(
    '/api/suggest',
    { method: 'POST', body: JSON.stringify(input) },
    true,
  )
}

export interface Suggestion extends Album {
  suggestedAt: string
}

export async function fetchSuggestions() {
  return (await request<{ suggestions: Suggestion[] }>('/api/review', {}, true)).suggestions
}

export function reviewSuggestion(input: {
  action: 'approve' | 'reject'
  spotifyId: string
  scene?: SceneKey
  year?: number
  note?: string
}) {
  return request<{ status: string; album?: Album }>(
    '/api/review',
    { method: 'POST', body: JSON.stringify(input) },
    true,
  )
}

export interface SimilarArtist {
  name: string
  match: number
}

export async function fetchSimilarArtists(artist: string) {
  return (await request<{ artists: SimilarArtist[] }>(`/api/similar?artist=${encodeURIComponent(artist)}`)).artists
}

export interface TopAlbum {
  artist: string
  title: string
  image: string | null
}

export async function fetchTopAlbum(artist: string) {
  return (await request<{ album: TopAlbum | null }>(`/api/top-album?artist=${encodeURIComponent(artist)}`)).album
}
