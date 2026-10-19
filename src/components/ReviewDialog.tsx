import { useEffect, useState } from 'react'
import { fetchSuggestions, reviewSuggestion, type Suggestion } from '../api'
import { countryName, flag } from '../countries'
import { SCENES, SCENE_ORDER } from '../scenes'
import type { Album, SceneKey } from '../types'
import { Dialog } from './Dialog'

interface ReviewDialogProps {
  onClose: () => void
  onPublished: (album: Album) => void
  onCountChange: (count: number) => void
}

export function ReviewDialog({ onClose, onPublished, onCountChange }: ReviewDialogProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [edits, setEdits] = useState<Record<string, { scene: SceneKey; year: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setSuggestions(await fetchSuggestions())
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem))
      }
    }
    void load()
  }, [])

  useEffect(() => {
    if (suggestions) onCountChange(suggestions.length)
  }, [suggestions, onCountChange])

  const decide = async (suggestion: Suggestion, action: 'approve' | 'reject') => {
    const spotifyId = suggestion.spotify?.id
    if (!spotifyId) return
    const edit = edits[spotifyId]
    setBusy(spotifyId)
    setError(null)
    try {
      const answer = await reviewSuggestion({
        action,
        spotifyId,
        scene: edit?.scene,
        year: edit?.year ? Number(edit.year) : undefined,
      })
      if (answer.album) onPublished(answer.album)
      setSuggestions((current) => current?.filter((item) => item.spotify?.id !== spotifyId) ?? null)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog title="Suggestions to review" onClose={onClose}>
      {error && <p className="dialog-error">{error}</p>}
      {!suggestions && !error && <p className="field-hint">Loading…</p>}
      {suggestions?.length === 0 && <p className="field-hint">Nothing waiting. All caught up.</p>}
      <ul className="reviews">
        {suggestions?.map((suggestion) => {
          const spotifyId = suggestion.spotify?.id ?? suggestion.id
          const edit = edits[spotifyId] ?? { scene: suggestion.scene, year: String(suggestion.year) }
          const update = (change: Partial<typeof edit>) =>
            setEdits((current) => ({ ...current, [spotifyId]: { ...edit, ...change } }))
          return (
            <li key={spotifyId} className="review">
              {suggestion.spotify?.coverSmall && <img src={suggestion.spotify.coverSmall} alt="" />}
              <div className="review-body">
                <p className="suggest-title">
                  {suggestion.title} <span>by {suggestion.artist}</span>
                </p>
                <p className="suggest-facts">
                  {suggestion.country ? `${flag(suggestion.country)} ${countryName(suggestion.country)} · ` : ''}
                  suggested {new Date(suggestion.suggestedAt).toLocaleDateString('en-GB')}
                </p>
                {suggestion.note && <p className="review-note">{suggestion.note}</p>}
                <div className="review-fields">
                  <select
                    aria-label="Scene"
                    value={edit.scene}
                    onChange={(event) => update({ scene: event.target.value as SceneKey })}
                  >
                    {SCENE_ORDER.map((scene) => (
                      <option key={scene} value={scene}>
                        {SCENES[scene].label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Year"
                    type="number"
                    value={edit.year}
                    onChange={(event) => update({ year: event.target.value })}
                  />
                  <button
                    type="button"
                    className="go"
                    disabled={busy === spotifyId}
                    onClick={() => void decide(suggestion, 'approve')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy === spotifyId}
                    onClick={() => void decide(suggestion, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}
