/**
 * Browser side of the "something changed, refetch" streams. Framework-free so it can be unit
 * tested; React components use it through `useLiveEvents` (use-live.ts).
 *
 * - message      -> onEvent
 * - open         -> stop polling, reset backoff, onEvent (catch up on anything missed)
 * - error        -> poll every `pollMs` until the stream is open again; if the browser gave up
 *                   (readyState CLOSED) re-create the EventSource after 1 s, 2 s, 4 s ... max 30 s
 * - tab visible  -> onEvent, and reconnect at once if the stream is closed
 */
export type LiveEnv = {
  EventSource: { new (url: string): EventSource; readonly CLOSED: number };
  visibility: () => DocumentVisibilityState;
  onVisibilityChange: (cb: () => void) => () => void;
};

export type LiveOptions = { pollMs?: number };

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 30_000;

export function browserLiveEnv(): LiveEnv {
  return {
    EventSource: window.EventSource,
    visibility: () => document.visibilityState,
    onVisibilityChange(cb) {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
  };
}

export function connectLive(
  url: string,
  onEvent: () => void,
  { pollMs = 15_000 }: LiveOptions = {},
  env: LiveEnv = browserLiveEnv(),
): () => void {
  let alive = true;
  let es: EventSource | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let backoff = MIN_BACKOFF;

  const fire = () => {
    if (alive) onEvent();
  };
  const stopPoll = () => {
    if (poll) clearInterval(poll);
    poll = null;
  };
  const startPoll = () => {
    poll ??= setInterval(fire, pollMs);
  };
  const clearRetry = () => {
    if (retry) clearTimeout(retry);
    retry = null;
  };

  const connect = () => {
    clearRetry();
    if (!alive) return;
    es?.close();
    const src = new env.EventSource(url);
    es = src;
    src.onopen = () => {
      backoff = MIN_BACKOFF;
      stopPoll();
      fire();
    };
    src.onmessage = () => fire();
    src.onerror = () => {
      startPoll();
      if (src.readyState === env.EventSource.CLOSED) {
        src.close();
        if (es === src) es = null;
        scheduleReconnect();
      }
    };
  };

  const scheduleReconnect = () => {
    if (retry || !alive) return;
    const wait = backoff;
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
    retry = setTimeout(connect, wait);
  };

  const offVis = env.onVisibilityChange(() => {
    if (env.visibility() !== "visible") return;
    fire();
    if (!es || es.readyState === env.EventSource.CLOSED) {
      backoff = MIN_BACKOFF;
      connect();
    }
  });

  connect();

  return () => {
    alive = false;
    clearRetry();
    stopPoll();
    offVis();
    es?.close();
    es = null;
  };
}
