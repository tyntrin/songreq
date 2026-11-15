"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RepertoireItem } from "@/lib/songs/repertoire";
import {
  addCustomSongAction,
  addItunesSongAction,
  removeRepertoireItemAction,
  updateRepertoireItemAction,
} from "./actions";

type Hit = { itunesTrackId: number; title: string; artist: string; inRepertoire: boolean };

const SEARCH_ERROR = "ค้นหาไม่ได้ตอนนี้ ลองใหม่อีกครั้ง หรือเพิ่มเอง";

const inputCls =
  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-[16px] text-ink outline-none focus:border-accent";

export function SongsClient({ items }: { items: RepertoireItem[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const reqSeq = useRef(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const term = q.trim();
    if (Array.from(term).length < 2) return;
    const seq = ++reqSeq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/songs/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { hits: Hit[] };
        if (seq !== reqSeq.current) return;
        setHits(data.hits);
        setSearchError(false);
      } catch {
        if (seq !== reqSeq.current) return;
        setHits(null);
        setSearchError(true);
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  function onQuery(value: string) {
    setQ(value);
    if (Array.from(value.trim()).length < 2) {
      reqSeq.current++; // drop any in-flight response
      setHits(null);
      setSearchError(false);
      setLoading(false);
    }
  }

  function add(h: Hit) {
    setAdded((s) => new Set(s).add(h.itunesTrackId));
    setMessage(null);
    startTransition(async () => {
      const r = await addItunesSongAction({
        itunesTrackId: h.itunesTrackId,
        title: h.title,
        artist: h.artist,
      });
      if (!r.ok) {
        setAdded((s) => {
          const n = new Set(s);
          n.delete(h.itunesTrackId);
          return n;
        });
        setMessage(r.error);
      }
    });
  }

  return (
    <main className="flex flex-col gap-4 px-4 pt-[18px]">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold">คลังเพลง</h1>
        <div className="text-sm text-muted">{items.length} เพลง</div>
      </div>

      <label className="flex h-12 items-center gap-2.5 rounded-[14px] border border-accent bg-surface px-3.5">
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#A89F94"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="sr-only">ค้นหาเพลงเพื่อเพิ่ม</span>
        <input
          type="search"
          value={q}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="ค้นหาเพลงเพื่อเพิ่ม"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none"
        />
      </label>

      {message && (
        <p role="alert" className="text-sm text-[#F0968E]">
          {message}
        </p>
      )}

      <section className="flex flex-col gap-1">
        {(hits !== null || searchError || loading) && (
          <h2 className="mb-1 text-sm font-semibold text-muted">ผลการค้นหา</h2>
        )}
        {loading && <p className="py-2 text-sm text-muted">กำลังค้นหา…</p>}
        {searchError && (
          <p role="alert" className="py-2 text-[15px] text-[#F0968E]">
            {SEARCH_ERROR}
          </p>
        )}
        {hits !== null && hits.length === 0 && !loading && (
          <p className="py-2 text-[15px] text-muted">ไม่พบเพลงที่ค้นหา</p>
        )}
        {hits?.map((h) => {
          const have = h.inRepertoire || added.has(h.itunesTrackId);
          return (
            <div
              key={h.itunesTrackId}
              className="flex items-center gap-3 border-b border-[#26201C] py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{h.title}</div>
                <div className="truncate text-sm text-muted">{h.artist}</div>
              </div>
              <button
                type="button"
                disabled={have}
                aria-pressed={have}
                onClick={() => add(h)}
                className={`h-11 min-w-[88px] shrink-0 rounded-full border px-3.5 text-sm font-semibold ${
                  have
                    ? "border-line-strong bg-transparent text-muted"
                    : "border-accent bg-accent text-on-accent"
                }`}
              >
                {have ? "มีแล้ว" : "+ เพิ่ม"}
              </button>
            </div>
          );
        })}

        {!formOpen ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="mt-2 flex h-12 items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#5A4F45] text-[15px] font-semibold"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5B544" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            ไม่เจอเพลงที่หา? เพิ่มเอง
          </button>
        ) : (
          <CustomForm onDone={() => setFormOpen(false)} initialTitle={q.trim()} />
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="mb-1 text-sm font-semibold text-muted">เพลงของฉัน</h2>
        {items.length === 0 && (
          <p className="py-2 text-[15px] text-muted">ยังไม่มีเพลง ค้นหาด้านบนเพื่อเริ่มเพิ่ม</p>
        )}
        {items.map((m) => (
          <SongRow
            key={m.id}
            item={m}
            open={editing === m.id}
            onToggle={() => setEditing(editing === m.id ? null : m.id)}
          />
        ))}
      </section>
    </main>
  );
}

function CustomForm({ onDone, initialTitle }: { onDone: () => void; initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle);
  const [artist, setArtist] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await addCustomSongAction({ title, artist });
      if (r.ok) onDone();
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-3.5">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        ชื่อเพลง
        <input className={inputCls} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        ศิลปิน
        <input className={inputCls} value={artist} maxLength={120} onChange={(e) => setArtist(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-[#F0968E]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="h-11 flex-1 rounded-full border border-line-strong text-[15px] font-semibold text-muted"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-11 flex-1 rounded-full bg-accent text-[15px] font-bold text-on-accent disabled:opacity-60"
        >
          บันทึก
        </button>
      </div>
    </form>
  );
}

function SongRow({ item, open, onToggle }: { item: RepertoireItem; open: boolean; onToggle: () => void }) {
  const [songKey, setSongKey] = useState(item.songKey ?? "");
  const [tags, setTags] = useState(item.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateRepertoireItemAction(item.id, {
        songKey: songKey.trim() === "" ? null : songKey,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (r.ok) onToggle();
      else setError(r.error);
    });
  }

  function remove() {
    startTransition(async () => {
      await removeRepertoireItemAction(item.id);
    });
  }

  return (
    <div className="border-b border-[#26201C] py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div>
            <div className="truncate text-base font-semibold">{item.title}</div>
            <div className="truncate text-sm text-muted">{item.artist}</div>
          </div>
          {(item.songKey || item.tags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {item.songKey && <Chip>คีย์ {item.songKey}</Chip>}
              {item.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={`แก้ไข ${item.title}`}
          aria-expanded={open}
          onClick={onToggle}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M5 12h.01M12 12h.01M19 12h.01" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface p-3.5">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            คีย์
            <input className={inputCls} value={songKey} maxLength={6} onChange={(e) => setSongKey(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            แท็ก (คั่นด้วยเครื่องหมายจุลภาค)
            <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ช้า, คู่" />
          </label>
          {error && (
            <p role="alert" className="text-sm text-[#F0968E]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className="h-11 flex-1 rounded-full border border-[#E5736A] text-[15px] font-semibold text-[#F0968E] disabled:opacity-60"
            >
              ลบ
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="h-11 flex-1 rounded-full bg-accent text-[15px] font-bold text-on-accent disabled:opacity-60"
            >
              บันทึก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-[#26211D] px-2 py-px text-xs text-[#E4DCD2]">{children}</span>;
}
