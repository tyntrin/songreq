"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n/customer";
import { keepAttemptAfter } from "@/lib/requests/attempt";
import { Header } from "./_components/Header";

type Song = { id: string; title: string; artist: string; tags: string[] };
type Props = {
  publicId: string;
  locale: Locale;
  displayName: string;
  avatarUrl: string | null;
  accepting: boolean;
  songs: Song[];
  tags: string[];
};

const MAX_SONGS = 10;
const TIPS = [0, 20, 50, 100, 200] as const;
type TipChoice = (typeof TIPS)[number] | "custom";

const iconProps = {
  "aria-hidden": true,
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
} as const;

export function RequestFlow({ publicId, locale, displayName, avatarUrl, accepting, songs, tags }: Props) {
  const router = useRouter();
  const storageKey = `sr_sel_${publicId}`;
  const [step, setStep] = useState<1 | 2>(1);
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [tip, setTip] = useState<TipChoice>(0);
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closed, setClosed] = useState(!accepting);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const attemptId = useRef<string | null>(null);
  const [restored, setRestored] = useState(false);

  const live = useMemo(() => songs.filter((s) => !removed.has(s.id)), [songs, removed]);
  const byId = useMemo(() => new Map(live.map((s) => [s.id, s])), [live]);

  // Restore selection after hydration (sessionStorage is client-only).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      const ids: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(ids)) {
        const valid = new Set(songs.map((s) => s.id));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSel(ids.filter((x): x is string => typeof x === "string" && valid.has(x)).slice(0, MAX_SONGS));
      }
    } catch {
      /* storage unavailable */
    }
    setRestored(true);
  }, [storageKey, songs]);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(sel));
    } catch {
      /* ignore */
    }
  }, [sel, restored, storageKey]);

  const edited = () => {
    attemptId.current = null;
    setError(null);
  };

  const selected = sel.map((id) => byId.get(id)).filter((s): s is Song => !!s);
  const selSet = new Set(selected.map((s) => s.id));

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return live.filter(
      (s) =>
        (!tag || s.tags.includes(tag)) &&
        (!needle ||
          s.title.toLocaleLowerCase().includes(needle) ||
          s.artist.toLocaleLowerCase().includes(needle)),
    );
  }, [live, q, tag]);

  function toggle(id: string) {
    edited();
    setNotice(null);
    setSel((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_SONGS) {
        setNotice(t(locale, "maxSongs", { n: MAX_SONGS }));
        return cur;
      }
      return [...cur, id];
    });
  }

  const customN = /^\d{1,5}$/.test(custom.trim()) ? Number(custom.trim()) : NaN;
  const customValid = customN >= 1 && customN <= 10000;
  const tipAmount = tip === "custom" ? (customValid ? customN : null) : tip;

  const cta =
    tip === "custom"
      ? customValid
        ? t(locale, "ctaTip", { amount: customN })
        : t(locale, "ctaCustom")
      : tip > 0
        ? t(locale, "ctaTip", { amount: tip })
        : t(locale, "ctaNoTip");

  async function submit() {
    if (pending || tipAmount === null || selected.length === 0) return;
    setPending(true);
    setError(null);
    attemptId.current ??= crypto.randomUUID();
    let res: Response;
    try {
      res = await fetch(`/api/r/${publicId}/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientRequestId: attemptId.current,
          songIds: selected.map((s) => s.id),
          name,
          message,
          tipAmount,
        }),
      });
    } catch {
      setPending(false);
      setError(t(locale, "networkError"));
      return; // keep selections and attempt id so a retry is idempotent
    }
    // 5xx: the server may have stored it, so a retry must reuse the same id. 4xx/success: reset.
    if (!keepAttemptAfter(res.status)) attemptId.current = null;
    if (res.status === 201) {
      const body = (await res.json()) as { requestId: string; tipAmount: number };
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      router.push(
        body.tipAmount > 0 ? `/r/${publicId}/pay/${body.requestId}` : `/r/${publicId}/status`,
      );
      return; // stay disabled while navigating
    }
    setPending(false);
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      unavailableSongIds?: string[];
    };
    if (res.status === 409 && body.error === "closed") {
      setClosed(true);
    } else if (res.status === 409 && body.error === "unavailable") {
      const gone = new Set(body.unavailableSongIds ?? []);
      setRemoved((r) => new Set([...r, ...gone]));
      setSel((cur) => cur.filter((id) => !gone.has(id)));
      setNotice(t(locale, "songsUnavailable"));
      setStep(1);
    } else if (res.status === 403) {
      setError(t(locale, "blocked"));
    } else if (res.status === 429) {
      setError(t(locale, "rateLimited"));
    } else {
      setError(t(locale, "networkError"));
    }
  }

  // ---------- Page 5: paused ----------
  if (closed) {
    return (
      <main className="flex flex-col gap-[18px] px-5 pb-10 pt-5">
        <Header locale={locale} displayName={displayName} avatarUrl={avatarUrl} open={false} />
        <div className="flex items-start gap-3 rounded-[14px] border border-line bg-surface p-4">
          <svg width={24} height={24} stroke="#F5B544" strokeWidth={2} {...iconProps} className="shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <div className="flex flex-col gap-1">
            <div className="text-base font-semibold">{t(locale, "closedTitle")}</div>
            <div className="text-sm leading-normal text-muted">{t(locale, "closedBody")}</div>
          </div>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {live.map((s) => (
            <li key={s.id} className="flex flex-col gap-0.5 border-b border-[#26201C] py-3">
              <div className="text-base font-semibold text-[#D8CFC4]">{s.title}</div>
              <div className="text-sm text-muted">{s.artist}</div>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  // ---------- Page 2: send ----------
  if (step === 2) {
    return (
      <>
      <main className="flex flex-col gap-5 px-5 pb-36 pt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t(locale, "backToSongs")}
            onClick={() => setStep(1)}
            className="flex size-11 items-center justify-center rounded-full border border-line bg-surface"
          >
            <svg width={20} height={20} stroke="#F4EFE8" strokeWidth={2.2} {...iconProps}>
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 className="m-0 text-[22px] font-bold">{t(locale, "sendTitle")}</h1>
        </div>

        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 mb-1 text-sm font-semibold text-muted">
            {t(locale, "selectedSongs", { n: selected.length })}
          </h2>
          {selected.length === 0 && (
            <p className="m-0 text-sm text-muted">{t(locale, "noSongsSelected")}</p>
          )}
          {selected.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-[14px] border border-line bg-surface py-2.5 pl-4 pr-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold">{s.title}</div>
                <div className="text-sm text-muted">{s.artist}</div>
              </div>
              <button
                type="button"
                aria-label={t(locale, "removeSong", { title: s.title })}
                onClick={() => toggle(s.id)}
                className="flex size-11 items-center justify-center rounded-full"
              >
                <svg width={18} height={18} stroke="#A89F94" strokeWidth={2.2} {...iconProps}>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-[#D8CFC4]">
              {t(locale, "nameLabel")}{" "}
              <span className="text-placeholder">{t(locale, "optional")}</span>
            </span>
            <input
              type="text"
              value={name}
              maxLength={40}
              onChange={(e) => {
                edited();
                setName(e.target.value);
              }}
              placeholder={t(locale, "namePlaceholder")}
              className="h-12 rounded-[14px] border border-line bg-surface px-3.5 text-base text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-[#D8CFC4]">
              {t(locale, "messageLabel")}{" "}
              <span className="text-placeholder">{t(locale, "optional")}</span>
            </span>
            <textarea
              rows={2}
              value={message}
              maxLength={140}
              onChange={(e) => {
                edited();
                setMessage(e.target.value);
              }}
              placeholder={t(locale, "messagePlaceholder")}
              className="resize-none rounded-[14px] border border-line bg-surface px-3.5 py-3 text-base text-ink outline-none focus:border-accent"
            />
            <span className="self-end text-xs text-placeholder">{message.length} / 140</span>
          </label>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className="m-0 text-[17px] font-bold">{t(locale, "tipTitle")}</h2>
          <div className="grid grid-cols-3 gap-2">
            {([...TIPS, "custom"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={tip === v}
                onClick={() => {
                  edited();
                  setTip(v);
                }}
                className={`h-12 rounded-full border text-base font-semibold ${tip === v ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface text-ink"}`}
              >
                {v === "custom" ? t(locale, "tipCustom") : v === 0 ? t(locale, "tipNone") : `฿${v}`}
              </button>
            ))}
          </div>
          {tip === "custom" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-[#D8CFC4]">{t(locale, "tipCustomLabel")}</span>
              <input
                type="text"
                inputMode="numeric"
                value={custom}
                maxLength={5}
                onChange={(e) => {
                  edited();
                  setCustom(e.target.value.replace(/\D/g, ""));
                }}
                className="h-12 rounded-[14px] border border-line bg-surface px-3.5 text-base text-ink outline-none focus:border-accent"
              />
              {custom !== "" && !customValid && (
                <span className="text-[13px] text-[#F2A38C]">{t(locale, "tipCustomInvalid")}</span>
              )}
            </label>
          )}
          <p className="m-0 text-[13px] leading-normal text-muted">{t(locale, "tipNote")}</p>
        </section>
      </main>
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px] border-t border-line bg-[#1B1714] px-5 pb-[30px] pt-3.5">
        {error && (
          <div role="alert" className="mb-2.5 flex items-center justify-between gap-3 text-sm text-[#F2A38C]">
            <span>{error}</span>
            <button type="button" onClick={submit} className="min-h-11 shrink-0 px-2 font-semibold text-accent">
              {t(locale, "retry")}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={pending || tipAmount === null || selected.length === 0}
          className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-accent text-[17px] font-bold text-on-accent disabled:opacity-50"
        >
          {pending ? t(locale, "ctaSending") : cta}
        </button>
      </div>
      </>
    );
  }

  // ---------- Page 1: song list ----------
  return (
    <>
    <main className="flex flex-col gap-[18px] px-5 pb-32 pt-5">
      <Header locale={locale} displayName={displayName} avatarUrl={avatarUrl} open />

      <label className="flex h-12 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5">
        <svg width={20} height={20} stroke="#A89F94" strokeWidth={2} {...iconProps}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="sr-only">{t(locale, "searchLabel")}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(locale, "searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none"
        />
      </label>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[null, ...tags].map((tg) => (
            <button
              key={tg ?? "__all"}
              type="button"
              aria-pressed={tag === tg}
              onClick={() => setTag(tg)}
              className={`h-9 rounded-full px-3.5 text-sm ${tag === tg ? "bg-accent font-semibold text-on-accent" : "border border-line bg-surface text-[#E4DCD2]"}`}
            >
              {tg ?? t(locale, "tagAll", { n: live.length })}
            </button>
          ))}
        </div>
      )}

      {notice && (
        <p role="status" className="m-0 rounded-[14px] bg-[#2B2218] px-4 py-3 text-sm text-[#E9DFD3]">
          {notice}
        </p>
      )}

      {live.length === 0 ? (
        <p className="m-0 text-center text-sm text-muted">{t(locale, "noSongs")}</p>
      ) : visible.length === 0 ? (
        <p className="m-0 text-center text-sm text-muted">{t(locale, "noResults")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {visible.map((s) => {
            const on = selSet.has(s.id);
            return (
              <li key={s.id} className="flex items-center gap-3 border-b border-[#26201C] py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="truncate text-base font-semibold">{s.title}</div>
                  <div className="truncate text-sm text-muted">{s.artist}</div>
                </div>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={t(locale, on ? "removeSong" : "selectSong", { title: s.title })}
                  onClick={() => toggle(s.id)}
                  className={`flex size-11 shrink-0 items-center justify-center rounded-full ${on ? "bg-accent" : "border border-line-strong bg-surface"}`}
                >
                  {on ? (
                    <svg width={20} height={20} stroke="#1A1408" strokeWidth={2.5} {...iconProps}>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  ) : (
                    <svg width={20} height={20} stroke="#F4EFE8" strokeWidth={2} {...iconProps}>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
    <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-[480px] items-center gap-3.5 border-t border-line bg-[#1B1714] px-5 pb-[30px] pt-3.5">
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="text-base font-semibold">{t(locale, "selectedCount", { n: selected.length })}</div>
        <div className="text-[13px] text-muted">{t(locale, "selectHint")}</div>
      </div>
      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => setStep(2)}
        className="inline-flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent px-[26px] text-[17px] font-bold text-on-accent disabled:opacity-50"
      >
        {t(locale, "next")}
        <svg width={18} height={18} stroke="#1A1408" strokeWidth={2.5} {...iconProps}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
    </>
  );
}
