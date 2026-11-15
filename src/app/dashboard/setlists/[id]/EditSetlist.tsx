"use client";

import { useState, useTransition } from "react";
import { deleteSetlistAction, saveSetlistAction } from "../actions";

type Item = { songId: string; title: string; artist: string; checked: boolean };

export function EditSetlist({
  setlistId,
  initialName,
  items,
  canDelete,
}: {
  setlistId: string;
  initialName: string;
  items: Item[];
  canDelete: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.checked).map((i) => i.songId)),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function toggle(songId: string) {
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(songId)) n.delete(songId);
      else n.add(songId);
      return n;
    });
    setMessage(null);
  }

  function save() {
    if (pending) return;
    // Existing members keep their order, newly checked songs are appended in list order.
    const initial = items.filter((i) => i.checked).map((i) => i.songId);
    const kept = initial.filter((id) => checked.has(id));
    const added = items.filter((i) => !i.checked && checked.has(i.songId)).map((i) => i.songId);
    start(async () => {
      const r = await saveSetlistAction(setlistId, name, [...kept, ...added]);
      setMessage(r.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: r.error });
    });
  }

  function remove() {
    if (pending) return;
    start(async () => {
      const r = await deleteSetlistAction(setlistId);
      // Success redirects; only failures come back.
      if (r && !r.ok) {
        setConfirming(false);
        setMessage({ ok: false, text: r.error });
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <label htmlFor="setlist-name" className="text-[14px] text-muted">
          ชื่อ setlist
        </label>
        <input
          id="setlist-name"
          value={name}
          maxLength={40}
          onChange={(e) => {
            setName(e.target.value);
            setMessage(null);
          }}
          className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[16px] text-ink outline-none focus:border-accent"
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-[17px] font-bold">
          เพลงใน setlist <span className="text-muted">({checked.size})</span>
        </h2>
        {items.length === 0 ? (
          <p className="m-0 text-[14px] text-muted">ยังไม่มีเพลงในคลัง เพิ่มเพลงที่แท็บ “เพลง” ก่อน</p>
        ) : (
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-line bg-surface p-0">
            {items.map((i) => (
              <li key={i.songId} className="border-b border-line last:border-b-0">
                <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={checked.has(i.songId)}
                    onChange={() => toggle(i.songId)}
                    className="size-5 shrink-0 accent-[#F5B544]"
                  />
                  <span className="min-w-0 text-[15px]">
                    <span className="font-semibold">{i.title}</span>
                    <span className="text-muted"> — {i.artist}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`m-0 text-[14px] ${message.ok ? "text-accent" : "text-[#F2A38C]"}`}
        >
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={pending || name.trim() === ""}
        className="h-[50px] rounded-[14px] bg-accent text-[16px] font-bold text-on-accent disabled:opacity-60"
      >
        {pending ? "กำลังบันทึก…" : "บันทึก"}
      </button>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {!confirming ? (
          <button
            type="button"
            disabled={!canDelete || pending}
            onClick={() => setConfirming(true)}
            className="h-11 rounded-xl border border-line-strong text-[15px] font-semibold text-[#F2A38C] disabled:opacity-40"
          >
            ลบ setlist นี้
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[14px] text-muted">
              ลบ setlist นี้ QR ของ setlist นี้จะใช้ไม่ได้อีก ยืนยันไหม
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-11 rounded-xl border border-line-strong text-[15px] font-semibold text-ink"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="h-11 rounded-xl bg-[#F2A38C] text-[15px] font-bold text-on-accent disabled:opacity-60"
              >
                ลบเลย
              </button>
            </div>
          </div>
        )}
        {!canDelete && (
          <p className="m-0 text-[13px] text-muted">ลบไม่ได้ เพราะต้องมี setlist อย่างน้อย 1 อัน</p>
        )}
      </div>
    </>
  );
}
