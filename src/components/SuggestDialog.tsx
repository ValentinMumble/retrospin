import {useEffect, useRef, useState} from 'react';
import {searchAlbums, suggestAlbum, type SearchResult} from '../api';
import {countryName, flag} from '../countries';
import {SCENES} from '../scenes';
import type {Album} from '../types';
import {Dialog} from './Dialog';

interface SuggestDialogProps {
  /** The site owner's suggestions go straight onto the timeline. */
  owner: boolean;
  /** Search to start with, e.g. an album picked from the Explore section. */
  initialQuery?: string;
  onClose: () => void;
  onPublished: (album: Album) => void;
}

const STATUS_LABELS = {published: 'On the timeline', pending: 'Waiting for review'};
const MAX_YEAR = new Date().getFullYear() + 1;

export function SuggestDialog({owner, initialQuery = '', onClose, onPublished}: SuggestDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [year, setYear] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{status: 'published' | 'pending'; album: Album} | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const title = owner ? 'Add an album' : 'Suggest an album';

  useEffect(() => {
    inputRef.current?.focus();
  }, [picked, done]);

  useEffect(() => {
    const text = query.trim();
    if (picked || text.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchAlbums(text);
        if (!cancelled) {
          setResults(found);
          setError(null);
        }
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, picked]);

  const shown = picked || query.trim().length < 2 ? [] : results;

  const pick = (result: SearchResult) => {
    setPicked(result);
    setYear(result.year ? String(result.year) : '');
    setNote('');
    setError(null);
  };

  const send = async () => {
    if (!picked) return;
    setSending(true);
    setError(null);
    try {
      const answer = await suggestAlbum({spotifyId: picked.spotifyId, note, year: year ? Number(year) : null});
      setDone(answer);
      if (answer.status === 'published') onPublished(answer.album);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setSending(false);
    }
  };

  const startOver = () => {
    setDone(null);
    setPicked(null);
    setQuery('');
    setResults([]);
  };

  if (done) {
    const {album} = done;
    return (
      <Dialog title={title} onClose={onClose}>
        <div className="suggest-done">
          {album.spotify?.coverSmall && <img src={album.spotify.coverSmall} alt="" />}
          <div>
            <p className="suggest-title">
              {album.title} <span>by {album.artist}</span>
            </p>
            <p>
              {done.status === 'published'
                ? 'It is on the timeline now.'
                : 'Thanks! It is waiting for review before it shows up on the timeline.'}
            </p>
            <p className="suggest-facts">
              {album.year} · {SCENES[album.scene].label}
              {album.country && ` · ${flag(album.country)} ${countryName(album.country)}`}
            </p>
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="go" onClick={startOver}>
            {owner ? 'Add another' : 'Suggest another'}
          </button>
        </div>
      </Dialog>
    );
  }

  if (picked) {
    return (
      <Dialog title={title} onClose={onClose}>
        <div className="suggest-picked">
          {picked.cover && <img src={picked.cover} alt="" />}
          <div>
            <p className="suggest-title">
              {picked.title} <span>by {picked.artist}</span>
            </p>
            <label className="field">
              Original release year
              <input
                ref={inputRef}
                type="number"
                min={1940}
                max={MAX_YEAR}
                value={year}
                onChange={event => setYear(event.target.value)}
              />
            </label>
          </div>
        </div>
        <label className="field">
          Why it belongs here (optional)
          <textarea
            maxLength={280}
            rows={3}
            value={note}
            placeholder="One or two sentences about the record"
            onChange={event => setNote(event.target.value)}
          />
          <span className="field-hint">{280 - note.length} characters left</span>
        </label>
        <p className="field-hint">
          {owner ? 'It goes straight onto the timeline. ' : ''}The scene, the country, the cover and the songs are
          fetched for you.
        </p>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={() => setPicked(null)}>
            Back
          </button>
          <button type="button" className="go" onClick={() => void send()} disabled={sending}>
            {sending ? 'Fetching the details…' : owner ? 'Add to the timeline' : 'Suggest it'}
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <input
        ref={inputRef}
        className="search dialog-search"
        type="search"
        placeholder="Search Spotify for an album or artist"
        aria-label="Search Spotify for an album or artist"
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      {error && <p className="dialog-error">{error}</p>}
      <ul className="results" aria-busy={searching}>
        {shown.map(result => (
          <li key={result.spotifyId}>
            <button type="button" className="result" disabled={result.status !== null} onClick={() => pick(result)}>
              {result.cover ? <img src={result.cover} alt="" /> : <span className="result-blank" />}
              <span className="result-text">
                <span className="result-title">{result.title}</span>
                <span className="result-meta">
                  {result.artist}
                  {result.year && ` · ${result.year}`}
                  {result.type !== 'album' && ` · ${result.type}`}
                </span>
              </span>
              {result.status && <span className="result-status">{STATUS_LABELS[result.status]}</span>}
            </button>
          </li>
        ))}
      </ul>
      {searching && <p className="field-hint">Searching…</p>}
      {!searching && query.trim().length >= 2 && shown.length === 0 && !error && (
        <p className="field-hint">Nothing found on Spotify.</p>
      )}
    </Dialog>
  );
}
