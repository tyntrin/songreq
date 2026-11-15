import { afterEach, describe, expect, it, vi } from "vitest";
import { bus } from "./bus";
import { sseStream } from "./sse";

afterEach(() => vi.useRealTimers());

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

describe("sseStream", () => {
  it("sets SSE headers", () => {
    const ac = new AbortController();
    const res = sseStream({ channels: ["c1"], signal: ac.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    ac.abort();
  });

  it("forwards bus events as data chunks and unsubscribes on abort", async () => {
    const ac = new AbortController();
    const res = sseStream({ channels: ["c1", "c2"], signal: ac.signal });
    const reader = res.body!.getReader();
    expect(bus.listenerCount("c1")).toBe(1);
    expect(bus.listenerCount("c2")).toBe(1);
    bus.publish("c2", { type: "request.updated" });
    expect(await readChunk(reader)).toContain('data: {"type":"request.updated"}');
    ac.abort();
    expect(bus.listenerCount("c1")).toBe(0);
    expect(bus.listenerCount("c2")).toBe(0);
  });

  it("drops events rejected by filter", async () => {
    const ac = new AbortController();
    const res = sseStream({
      channels: ["c4"],
      signal: ac.signal,
      filter: (e) => e.type !== "request.created",
    });
    const reader = res.body!.getReader();
    bus.publish("c4", { type: "request.created" });
    bus.publish("c4", { type: "items.seen" });
    const chunk = await readChunk(reader);
    expect(chunk).toContain("items.seen");
    expect(chunk).not.toContain("request.created");
    ac.abort();
  });

  it("sends prelude first when given", async () => {
    const ac = new AbortController();
    const res = sseStream({ channels: ["c5"], signal: ac.signal, prelude: ": ok\n\n" });
    expect(await readChunk(res.body!.getReader())).toBe(": ok\n\n");
    ac.abort();
  });

  it("sends heartbeat pings", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const res = sseStream({ channels: ["c3"], signal: ac.signal, heartbeatMs: 10 });
    const reader = res.body!.getReader();
    await vi.advanceTimersByTimeAsync(11);
    expect(await readChunk(reader)).toContain("event: ping");
    ac.abort();
  });
});
