import {Redis} from '@upstash/redis';
import type {Album} from '../../src/types';
import {HttpError} from './http.js';

/** Published albums, by album id. */
export const ALBUMS = 'retrospin:albums';
/** Spotify album ids of the published albums, to spot duplicates quickly. */
export const SPOTIFY_IDS = 'retrospin:spotify-ids';
/** Suggestions waiting for review, by Spotify album id. */
export const PENDING = 'retrospin:pending';
/** Last.fm's similar artists of each artist on the timeline, as [name, match] pairs, for the galaxy links. */
export const SIMILAR = 'retrospin:similar';

export interface Suggestion extends Album {
  suggestedAt: string;
}

let client: Redis | null = null;

/** The Upstash Redis client, from the variables Vercel adds when the store is connected. */
export function redis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new HttpError(503, 'The album store is not connected yet');
  client ??= new Redis({url, token});
  return client;
}

/** Counts a request and refuses it past `limit` per `windowSeconds` for this key. */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const store = redis();
  const counter = `retrospin:rate:${key}`;
  const count = await store.incr(counter);
  if (count === 1) await store.expire(counter, windowSeconds);
  if (count > limit) throw new HttpError(429, 'Too many requests, try again later');
}
