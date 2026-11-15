"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FeedCardJson, FeedPayload } from "@/lib/requests/feed";
import { blockDeviceAction, hideRequestsAction } from "./actions";

const PILL_MS = 60_000;
const svg = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
} as const;

const cardKey = (c: FeedCardJson) => `${c.songId}|${c.latestAt}`;

export function relativeTime(fromIso: string, now: number): string {
  const min = Math.floor((now - new Date(fromIso).getTime()) / 60000);
  if (min < 1) return "เมื่อกี้";
  if (min < 60) return `${min} นาทีก่อน`;
  return `${Math.floor(min / 60)} ชม.ก่อน`;
}

const DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function dateLabel(now: number): string {
  // Night runs 06:00-05:59 Bangkok: shift +7h (to Bangkok wall clock) -6h (night start), read UTC fields.
  const d = new Date(now + 3_600_000);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

type AudioCtor = typeof AudioContext;

const SOUND_EVENT = "sr-sound-change";
function readSound(): boolean {
  try {
    return localStorage.getItem("sr_sound") !== "off";
  } catch {
    return true;
  }
}
function subscribeSound(cb: () => void) {
  window.addEventListener(SOUND_EVENT, cb);
  return () => window.removeEventListener(SOUND_EVENT, cb);
}

export function Monitor({ initial, serverNow }: { initial: FeedPayload; serverNow: number }) {
  const [data, setData] = useState(initial);
  const [setlist, setSetlist] = useState<string | null>(null);
  const [now, setNow] = useState(serverNow);
  const soundOn = useSyncExternalStore(subscribeSound, readSound, () => true);
  const [firstSeen, setFirstSeen] = useState(
    () => new Map(initial.cards.filter((c) => c.isNew).map((c) => [cardKey(c), serverNow] as const)),
  );
  const [audioReady, setAudioReady] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const setlistRef = useRef<string | null>(null);
  const soundRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);
  const prevKeys = useRef<{ filter: string | null; keys: Set<string> }>({
    filter: null,
    keys: new Set(initial.cards.map(cardKey)),
  });
  const sentIds = useRef(new Set<string>());
  const reqSeq = useRef(0);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  // clock for relative time and pill expiry
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // audio context: browsers keep it suspended until a user gesture
  useEffect(() => {
    const Ctor: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) {
      void Promise.resolve().then(() => setAudioReady(true)); // nothing to unlock
      return;
    }
    const ctx = new Ctor();
    audioRef.current = ctx;
    const sync = () => setAudioReady(ctx.state === "running");
    ctx.addEventListener("statechange", sync);
    void Promise.resolve().then(sync);
    const unlock = () => void ctx.resume().catch(() => {});
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      ctx.removeEventListener("statechange", sync);
      document.removeEventListener("pointerdown", unlock);
      void ctx.close().catch(() => {});
    };
  }, []);

  const chime = useCallback(() => {
    const ctx = audioRef.current;
    if (soundRef.current && ctx && ctx.state === "running") {
      [0, 0.22].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = i === 0 ? 880 : 1175;
        const t0 = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.18);
      });
    }
    if (soundRef.current) navigator.vibrate?.(200);
  }, []);

  const apply = useCallback(
    (p: FeedPayload, filter: string | null) => {
      const keys = new Set(p.cards.map(cardKey));
      const prev = prevKeys.current;
      const fresh = prev.filter === filter && p.cards.some((c) => !prev.keys.has(cardKey(c)));
      prevKeys.current = { filter, keys };
      if (fresh) chime();
      const t = Date.now();
      setFirstSeen((m) => {
        const add = p.cards.filter((c) => c.isNew && !m.has(cardKey(c)));
        if (add.length === 0) return m;
        const next = new Map(m);
        for (const c of add) next.set(cardKey(c), t);
        return next;
      });
      setData(p);
    },
    [chime],
  );

  const refetchRef = useRef<() => void>(() => {});
  const doRefetch = useCallback(async () => {
    const filter = setlistRef.current;
    const seq = ++reqSeq.current;
    try {
      const res = await fetch(`/api/dashboard/feed${filter ? `?setlist=${encodeURIComponent(filter)}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok || seq !== reqSeq.current) return;
      apply((await res.json()) as FeedPayload, filter);
    } catch {
      /* keep last known state */
    }
  }, [apply]);
  useEffect(() => {
    refetchRef.current = () => void doRefetch();
  }, [doRefetch]);

  // realtime + fallback polling + visibility refetch + wake lock
  useEffect(() => {
    let alive = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let lock: WakeLockSentinel | null = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => refetchRef.current(), 300);
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const requestLock = async () => {
      try {
        if (document.visibilityState === "visible" && !lock) {
          lock = (await navigator.wakeLock?.request("screen")) ?? null;
          lock?.addEventListener("release", () => {
            lock = null;
          });
          if (!alive) void lock?.release().catch(() => {});
        }
      } catch {
        /* ignore */
      }
    };
    const es = new EventSource("/api/dashboard/stream");
    es.onopen = () => {
      stopPoll();
      schedule();
    };
    es.onmessage = schedule;
    es.onerror = () => {
      poll ??= setInterval(() => refetchRef.current(), 15000);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        schedule();
        void requestLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    void requestLock();
    return () => {
      alive = false;
      es.close();
      stopPoll();
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, []);

  // after each render: mark new cards seen once
  useEffect(() => {
    const toSend: string[] = [];
    for (const c of data.cards) {
      if (!c.isNew) continue;
      for (const id of c.itemIds) {
        if (!sentIds.current.has(id)) {
          sentIds.current.add(id);
          toSend.push(id);
        }
      }
    }
    if (toSend.length === 0) return;
    for (let i = 0; i < toSend.length; i += 200) {
      const chunk = toSend.slice(i, i + 200);
      fetch("/api/dashboard/seen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemIds: chunk }),
      })
        .then((r) => {
          if (!r.ok) chunk.forEach((id) => sentIds.current.delete(id));
        })
        .catch(() => chunk.forEach((id) => sentIds.current.delete(id)));
    }
  }, [data]);

  const pickSetlist = (id: string | null) => {
    setlistRef.current = id;
    setSetlist(id);
    refetchRef.current();
  };

  const toggleSound = () => {
    const on = !soundOn;
    try {
      localStorage.setItem("sr_sound", on ? "on" : "off");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(SOUND_EVENT));
  };

  const enableAudio = () => void audioRef.current?.resume().catch(() => {});

  const showPill = (c: FeedCardJson) => {
    if (c.isNew) return true;
    const t = firstSeen.get(cardKey(c));
    return t !== undefined && now - t < PILL_MS;
  };

  const chip = (active: boolean) =>
    `h-9 shrink-0 rounded-full px-3.5 text-sm ${
      active ? "bg-accent font-semibold text-on-accent" : "border border-line bg-surface text-[#E4DCD2]"
    }`;

  return (
    <main className="flex flex-col gap-3.5 px-4 pt-[18px]">
      <div className="flex items-center gap-2.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <h1 className="text-[22px] font-bold">คำขอคืนนี้</h1>
          <div className="text-[13px] text-muted">{dateLabel(now)} · จอเปิดค้างไว้</div>
        </div>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={soundOn ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"}
          aria-pressed={soundOn}
          className={`flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface ${
            soundOn ? "text-accent" : "text-muted"
          }`}
        >
          <svg {...svg} width="20" height="20">
            <path d="M11 5L6 9H3v6h3l5 4V5z" />
            {soundOn ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="M22 9l-6 6M16 9l6 6" />}
          </svg>
        </button>
      </div>

      {soundOn && !audioReady && (
        <button
          type="button"
          onClick={enableAudio}
          className="min-h-11 rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold text-accent"
        >
          แตะเพื่อเปิดเสียง
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[14px] border border-line bg-surface px-3.5 py-3">
          <div className="text-[13px] text-muted">คำขอ</div>
          <div className="text-[28px] font-bold leading-tight">{data.requestCount}</div>
        </div>
        <div className="rounded-[14px] border border-line bg-surface px-3.5 py-3">
          <div className="text-[13px] text-muted">ทิปที่ลูกค้าแจ้ง</div>
          <div className="text-[28px] font-bold leading-tight text-accent">฿{data.tipTotal}</div>
        </div>
      </div>

      {data.setlists.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          <button type="button" className={chip(setlist === null)} onClick={() => pickSetlist(null)}>
            ทุก QR
          </button>
          {data.setlists.map((s) => (
            <button key={s.id} type="button" className={chip(setlist === s.id)} onClick={() => pickSetlist(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {data.cards.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-surface px-4 py-10 text-center">
          <div className="text-lg font-semibold">ยังไม่มีคำขอคืนนี้</div>
          <div className="text-[15px] text-muted">ลูกค้าสแกน QR แล้วเลือกเพลงได้เลย</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.cards.map((c) => {
            const isNew = showPill(c);
            const open = menuFor === c.songId;
            return (
              <article
                key={c.songId}
                className={`relative flex flex-col gap-2.5 rounded-2xl border px-4 py-3.5 ${
                  isNew ? "border-accent bg-[#221B14]" : "border-line bg-surface"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-xl font-bold leading-tight">{c.title}</div>
                    <div className="text-[15px] text-muted">{c.artist}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {isNew && (
                      <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">ใหม่</span>
                    )}
                    {c.times > 1 && (
                      <span className="rounded-full bg-[#2B2218] px-2.5 py-0.5 text-[13px] font-bold text-accent">
                        ขอ {c.times} ครั้ง
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="เมนูเพิ่มเติม"
                    aria-expanded={open}
                    onClick={() => setMenuFor(open ? null : c.songId)}
                    className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
                  >
                    <svg {...svg} width="20" height="20">
                      <path d="M5 12h.01M12 12h.01M19 12h.01" />
                    </svg>
                  </button>
                </div>
                {open && (
                  <div className="absolute right-3 top-14 z-10 flex w-52 flex-col rounded-xl border border-line-strong bg-surface p-1 shadow-lg">
                    <button
                      type="button"
                      className="min-h-11 rounded-lg px-3 text-left text-[15px] hover:bg-[#26211D]"
                      onClick={async () => {
                        setMenuFor(null);
                        await hideRequestsAction(c.requestIds);
                        refetchRef.current();
                      }}
                    >
                      ซ่อน
                    </button>
                    <button
                      type="button"
                      disabled={c.deviceIds.length !== 1}
                      className="min-h-11 rounded-lg px-3 text-left text-[15px] text-[#F08A7E] hover:bg-[#26211D] disabled:text-placeholder"
                      onClick={async () => {
                        if (!confirm("บล็อกเครื่องนี้? เครื่องนี้จะขอเพลงไม่ได้อีก")) return;
                        setMenuFor(null);
                        await blockDeviceAction(c.deviceIds[0]);
                        refetchRef.current();
                      }}
                    >
                      บล็อกเครื่องนี้
                    </button>
                    {c.deviceIds.length > 1 && <div className="px-3 pb-2 text-xs text-muted">ขอหลายเครื่อง</div>}
                  </div>
                )}
                {c.latestMessage && (
                  <div className="rounded-[10px] bg-[#26211D] px-3 py-2 text-[15px] leading-normal text-[#E9DFD3]">
                    &ldquo;{c.latestMessage}&rdquo;
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  <span>{c.requesterLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{relativeTime(c.latestAt, now)}</span>
                  {c.tipTotal > 0 && (
                    <span className="ml-auto font-semibold text-accent">ทิป ฿{c.tipTotal} (แจ้งโอน)</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
