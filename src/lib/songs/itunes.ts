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

  let data: { results?: Array<{ trackId?: unknown; trackName?: unknown; artistName?: unknown }> };
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new UpstreamError(`iTunes responded ${res.status}`);
    data = await res.json();
  } catch (e) {
    throw e instanceof UpstreamError ? e : new UpstreamError();
  }

  const seen = new Set<string>();
  const hits: SongHit[] = [];
  for (const r of data.results ?? []) {
    if (typeof r.trackId !== "number" || typeof r.trackName !== "string" || typeof r.artistName !== "string") continue;
    const title = r.trackName.trim();
    const artist = r.artistName.trim();
    if (!title || !artist) continue;
    const dedupe = `${title.toLowerCase()}\u0000${artist.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    hits.push({ itunesTrackId: r.trackId, title, artist });
  }

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), hits });
  return hits;
}
