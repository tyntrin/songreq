"use client";

import { useState, useTransition } from "react";
import { createInviteAction, removeMemberAction } from "./actions";

export function InviteButton() {
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const copy = async (u: string) => {
    try {
      await navigator.clipboard.writeText(u);
      setMsg("คัดลอกแล้ว");
    } catch {
      setMsg("คัดลอกไม่ได้ กดค้างที่ลิงก์เพื่อคัดลอกเอง");
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await createInviteAction();
            if (r.error) return setMsg(r.error);
            setUrl(r.url!);
            await copy(r.url!);
          })
        }
        className="flex h-[46px] items-center justify-center gap-2 rounded-xl border border-dashed border-[#5A4F45] text-[15px] font-semibold disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" />
        </svg>
        ส่งลิงก์เชิญสมาชิก
      </button>
      {url && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-bg p-3">
          <input readOnly value={url} aria-label="ลิงก์เชิญ" onFocus={(e) => e.currentTarget.select()} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-muted">หมดอายุใน 7 วัน</span>
            <button type="button" onClick={() => copy(url)} className="h-11 rounded-full bg-accent px-4 text-sm font-bold text-on-accent">
              คัดลอก
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p role="status" className="text-[13px] text-muted">
          {msg}
        </p>
      )}
    </div>
  );
}

export function RemoveMemberButton({ userId, name }: { userId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`เอา ${name} ออกจากวง`}
      onClick={() => {
        if (window.confirm(`เอา ${name} ออกจากวง?`)) start(() => removeMemberAction(userId));
      }}
      className="h-11 rounded-full px-3 text-[13px] font-semibold text-[#E39B8B] disabled:opacity-60"
    >
      เอาออก
    </button>
  );
}
