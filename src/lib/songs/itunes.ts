export type SongHit = { itunesTrackId: number; title: string; artist: string };

export class UpstreamError extends Error {
  constructor(message = "Search upstream unavailable") {
    super(message);
    this.name = "UpstreamError";
  }
}

const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8000;
const MAX_CACHE = 500;
const cache = new Map<string, { at: number; hits: SongHit[] }>();

export function __clearItunesCache(): void {
  cache.clear();
}

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function searchItunes(q: string, fetchImpl: typeof fetch = fetch): Promise<SongHit[]> {
  const key = normalize(q);
  if (Array.from(key).length < 2) return [];

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.hits;

  const url =
    "https://itunes.apple.com/search?" +
    new URLSearchParams({ term: key, country: "TH", entity: "song", limit: "15" }).toString();

  const results = await fetchResults(url, fetchImpl);
  const seen = new Set<string>();
  const hits: SongHit[] = [];
  for (const r of results) {
    const hit = toHit(r);
    if (!hit) continue;
    const dedupe = `${hit.title.toLowerCase()}\u0000${hit.artist.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    hits.push(hit);
  }

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), hits });
  return hits;
}

/** Resolve a track id against iTunes (server-side verification). null = no such track. */
export async function lookupItunesTrack(
  trackId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<SongHit | null> {
  if (!Number.isSafeInteger(trackId) || trackId <= 0) return null;
  const now = Date.now();
  for (const entry of cache.values()) {
    if (now - entry.at >= TTL_MS) continue;
    const found = entry.hits.find((h) => h.itunesTrackId === trackId);
    if (found) return found;
  }
  const url =
    "https://itunes.apple.com/lookup?" +
    new URLSearchParams({ id: String(trackId), country: "TH", entity: "song" }).toString();
  const results = await fetchResults(url, fetchImpl);
  for (const r of results) {
    const hit = toHit(r);
    if (hit && hit.itunesTrackId === trackId) return hit;
  }
  return null;
}

type Raw = { trackId?: unknown; trackName?: unknown; artistName?: unknown };

function toHit(r: Raw): SongHit | null {
  if (typeof r.trackId !== "number" || typeof r.trackName !== "string" || typeof r.artistName !== "string") {
    return null;
  }
  const title = r.trackName.trim();
  const artist = r.artistName.trim();
  if (!title || !artist) return null;
  return { itunesTrackId: r.trackId, title, artist };
}

async function fetchResults(url: string, fetchImpl: typeof fetch): Promise<Raw[]> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new UpstreamError(`iTunes responded ${res.status}`);
    const data = (await res.json()) as { results?: Raw[] };
    return data.results ?? [];
  } catch (e) {
    throw e instanceof UpstreamError ? e : new UpstreamError();
  }
}
