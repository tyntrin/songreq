"use client";

import { useEffect, useRef } from "react";
import { connectLive, type LiveOptions } from "./live";

/**
 * Subscribes to an SSE "refetch" stream for the component's lifetime: `onEvent` runs on every
 * message, on (re)connect and when the tab becomes visible; falls back to polling every `pollMs`
 * while disconnected, and re-creates the EventSource with backoff if the browser gives up.
 */
export function useLiveEvents(url: string, onEvent: () => void, { pollMs = 15_000 }: LiveOptions = {}): void {
  const cb = useRef(onEvent);
  useEffect(() => {
    cb.current = onEvent;
  }, [onEvent]);
  useEffect(() => connectLive(url, () => cb.current(), { pollMs }), [url, pollMs]);
}
