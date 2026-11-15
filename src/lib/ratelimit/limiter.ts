export type Limiter = { consume(key: string, cost: number): boolean };

type Entry = { at: number; cost: number };

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): Limiter {
  const { limit, windowMs } = opts;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, Entry[]>();
  let lastSweep = now();

  function live(entries: Entry[], t: number): Entry[] {
    return entries.filter((e) => e.at > t - windowMs);
  }

  function sweep(t: number) {
    lastSweep = t;
    for (const [key, entries] of buckets) {
      const kept = live(entries, t);
      if (kept.length === 0) buckets.delete(key);
      else if (kept.length !== entries.length) buckets.set(key, kept);
    }
  }

  return {
    consume(key, cost) {
      const t = now();
      if (t - lastSweep >= windowMs) sweep(t);
      const entries = live(buckets.get(key) ?? [], t);
      const used = entries.reduce((sum, e) => sum + e.cost, 0);
      if (used + cost > limit) {
        if (entries.length === 0) buckets.delete(key);
        else buckets.set(key, entries);
        return false;
      }
      entries.push({ at: t, cost });
      buckets.set(key, entries);
      return true;
    },
  };
}

export const deviceLimiter = createRateLimiter({ limit: 10, windowMs: 600000 });
export const ipLimiter = createRateLimiter({ limit: 60, windowMs: 600000 });
