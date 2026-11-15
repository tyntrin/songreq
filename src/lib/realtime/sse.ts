import { bus, type BusEvent } from "./bus";

export function sseStream(opts: {
  channels: string[];
  signal: AbortSignal;
  heartbeatMs?: number;
  /** Optional allow-list: only events passing this are forwarded. */
  filter?: (e: BusEvent) => boolean;
  /** Sent immediately so proxies/EventSource see the response start (e.g. ": ok\n\n"). */
  prelude?: string;
}): Response {
  const { channels, signal, heartbeatMs = 25000, filter, prelude } = opts;
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      const onEvent = (e: BusEvent) => {
        if (filter && !filter(e)) return;
        send(`data: ${JSON.stringify({ type: e.type })}\n\n`);
      };
      const unsubs = channels.map((c) => bus.subscribe(c, onEvent));
      const timer = setInterval(() => send("event: ping\ndata: \n\n"), heartbeatMs);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsubs.forEach((u) => u());
        signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const onAbort = () => cleanup();
      if (prelude) send(prelude);
      if (signal.aborted) cleanup();
      else signal.addEventListener("abort", onAbort);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
