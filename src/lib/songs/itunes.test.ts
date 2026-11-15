import { describe, expect, it, vi } from "vitest";
import { UpstreamError, searchItunes, lookupItunesTrack, __clearItunesCache } from "./itunes";

function fakeFetch(results: unknown[], ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ results }) }) as Response);
}

const sample = [
  { trackId: 1, trackName: "Yellow", artistName: "Coldplay" },
  { trackId: 2, trackName: "yellow ", artistName: "COLDPLAY" },
  { trackId: 3, trackName: "Fix You", artistName: "Coldplay" },
];

describe("searchItunes", () => {
  it("dedupes by lowercase title+artist and maps fields", async () => {
    __clearItunesCache();
    const f = fakeFetch(sample);
    const hits = await searchItunes("coldplay", f);
    expect(hits).toEqual([
      { itunesTrackId: 1, title: "Yellow", artist: "Coldplay" },
      { itunesTrackId: 3, title: "Fix You", artist: "Coldplay" },
    ]);
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("country=TH");
    expect(url).toContain("entity=song");
    expect(url).toContain("limit=15");
  });

  it("caches by normalized query", async () => {
    __clearItunesCache();
    const f = fakeFetch(sample);
    await searchItunes("Cold  Play", f);
    await searchItunes("  cold play ", f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("returns [] for short queries without fetching", async () => {
    const f = fakeFetch(sample);
    expect(await searchItunes("a", f)).toEqual([]);
    expect(await searchItunes("  ", f)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("throws UpstreamError on network error or non-OK", async () => {
    __clearItunesCache();
    const bad = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(searchItunes("zzz1", bad as unknown as typeof fetch)).rejects.toBeInstanceOf(UpstreamError);
    await expect(searchItunes("zzz2", fakeFetch([], false))).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("lookupItunesTrack", () => {
  it("maps fields from lookup", async () => {
    __clearItunesCache();
    const f = fakeFetch([{ trackId: 9, trackName: " Clocks ", artistName: "Coldplay" }]);
    expect(await lookupItunesTrack(9, f)).toEqual({ itunesTrackId: 9, title: "Clocks", artist: "Coldplay" });
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/lookup?");
    expect(url).toContain("id=9");
    expect(url).toContain("country=TH");
  });

  it("returns null when no result", async () => {
    __clearItunesCache();
    expect(await lookupItunesTrack(10, fakeFetch([]))).toBeNull();
  });

  it("throws UpstreamError on non-OK", async () => {
    __clearItunesCache();
    await expect(lookupItunesTrack(11, fakeFetch([], false))).rejects.toBeInstanceOf(UpstreamError);
  });

  it("reuses a cached search hit", async () => {
    __clearItunesCache();
    await searchItunes("coldplay", fakeFetch(sample));
    const f = fakeFetch([]);
    expect(await lookupItunesTrack(3, f)).toEqual({ itunesTrackId: 3, title: "Fix You", artist: "Coldplay" });
    expect(f).not.toHaveBeenCalled();
  });
});
