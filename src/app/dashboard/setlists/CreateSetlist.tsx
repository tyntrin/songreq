"use client";

import { useState, useTransition } from "react";
import { createSetlistAction } from "./actions";

export function CreateSetlist() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    start(async () => {
      const r = await createSetlistAction(name);
      // On success the action redirects; only failures return here.
      if (r && !r.ok) setError(r.error);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#5A4F45] text-[15px] font-semibold text-ink"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5B544" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        สร้าง setlist ใหม่
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-4">
      <label htmlFor="new-setlist" className="text-[14px] text-muted">
        ชื่อ setlist (เช่น ชื่อร้าน)
      </label>
      <input
        id="new-setlist"
        autoFocus
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        className="h-11 w-full rounded-xl border border-line bg-bg px-3 text-[16px] text-ink outline-none focus:border-accent"
      />
      {error && (
        <p role="alert" className="m-0 text-[14px] text-[#F2A38C]">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="h-11 rounded-xl border border-line-strong text-[15px] font-semibold text-ink"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={pending || name.trim() === ""}
          className="h-11 rounded-xl bg-accent text-[15px] font-bold text-on-accent disabled:opacity-60"
        >
          {pending ? "กำลังสร้าง…" : "สร้าง"}
        </button>
      </div>
    </form>
  );
}
