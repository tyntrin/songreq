import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectLive, type LiveEnv } from "./live";

class FakeES {
  static CLOSED = 2;
  static all: FakeES[] = [];
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeES.all.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  /** Network drop the browser will retry by itself (readyState CONNECTING). */
  blip() {
    this.readyState = 0;
    this.onerror?.();
  }
  /** Fatal: browser gave up (e.g. non-200, proxy closed for good). */
  die() {
    this.readyState = 2;
    this.onerror?.();
  }
}

function makeEnv() {
  const listeners = new Set<() => void>();
  let state: "visible" | "hidden" = "visible";
  const env: LiveEnv = {
    EventSource: FakeES as unknown as LiveEnv["EventSource"],
    visibility: () => state,
    onVisibilityChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return {
    env,
    setVisible(v: "visible" | "hidden") {
      state = v;
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
  };
}

const last = () => FakeES.all[FakeES.all.length - 1];

describe("connectLive", () => {
  beforeEach(() => {
    FakeES.all = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("refetches on open and on every message; stops polling once open", () => {
    const onEvent = vi.fn();
    const { env } = makeEnv();
    const stop = connectLive("/s", onEvent, { pollMs: 1000 }, env);
    expect(FakeES.all).toHaveLength(1);
    last().blip(); // error before open -> polling
    vi.advanceTimersByTime(2500);
    expect(onEvent).toHaveBeenCalledTimes(2);
    last().open();
    expect(onEvent).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(5000);
    expect(onEvent).toHaveBeenCalledTimes(3); // polling stopped
    last().onmessage?.();
    expect(onEvent).toHaveBeenCalledTimes(4);
    stop();
  });

  it("re-creates a CLOSED EventSource with backoff 1s, 2s, 4s ... capped at 30s, reset on open", () => {
    const onEvent = vi.fn();
    const { env } = makeEnv();
    const stop = connectLive("/s", onEvent, { pollMs: 60_000 }, env);
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      const before = FakeES.all.length;
      last().die();
      expect(FakeES.all[before - 1].closed).toBe(true);
      let waited = 0;
      while (FakeES.all.length === before) {
        vi.advanceTimersByTime(500);
        waited += 500;
      }
      waits.push(waited);
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    last().open();
    const before = FakeES.all.length;
    last().die();
    vi.advanceTimersByTime(1000);
    expect(FakeES.all.length).toBe(before + 1);
    stop();
  });

  it("does not re-create while the browser is retrying by itself", () => {
    const { env } = makeEnv();
    const stop = connectLive("/s", vi.fn(), {}, env);
    last().blip();
    vi.advanceTimersByTime(60_000);
    expect(FakeES.all).toHaveLength(1);
    stop();
  });

  it("on becoming visible: refetches, and reconnects at once if the stream is closed", () => {
    const onEvent = vi.fn();
    const h = makeEnv();
    const stop = connectLive("/s", onEvent, { pollMs: 60_000 }, h.env);
    last().open();
    onEvent.mockClear();
    h.setVisible("hidden");
    expect(onEvent).not.toHaveBeenCalled();
    h.setVisible("visible");
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(FakeES.all).toHaveLength(1); // still open: no reconnect
    last().die();
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(30_000);
      last().die();
    }
    const n = FakeES.all.length;
    h.setVisible("visible");
    expect(FakeES.all.length).toBe(n + 1); // immediate, no backoff wait
    stop();
  });

  it("cleanup closes everything", () => {
    const onEvent = vi.fn();
    const h = makeEnv();
    const stop = connectLive("/s", onEvent, { pollMs: 1000 }, h.env);
    last().die(); // polling + reconnect timer pending
    stop();
    expect(FakeES.all.every((e) => e.closed)).toBe(true);
    expect(h.listenerCount()).toBe(0);
    onEvent.mockClear();
    vi.advanceTimersByTime(120_000);
    expect(onEvent).not.toHaveBeenCalled();
    expect(FakeES.all).toHaveLength(1);
  });
});
