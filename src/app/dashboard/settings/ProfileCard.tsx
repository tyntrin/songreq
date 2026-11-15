"use client";

import { useActionState, useState } from "react";
import { AvatarUpload } from "@/components/AvatarUpload";
import type { PromptPayType } from "@/lib/promptpay/promptpay";
import { updateProfileAction, uploadAvatarAction, type ProfileState } from "./actions";

const KINDS: Array<{ id: PromptPayType; label: string; placeholder: string }> = [
  { id: "phone", label: "เบอร์มือถือ", placeholder: "08x-xxx-xxxx" },
  { id: "national_id", label: "เลขบัตรประชาชน", placeholder: "x-xxxx-xxxxx-xx-x" },
];

const field = (bad: boolean) =>
  `h-[50px] rounded-[14px] border bg-bg px-3.5 text-[17px] text-ink outline-none focus:border-accent ${bad ? "border-[#E5736A]" : "border-line"}`;

export function ProfileCard({
  name,
  avatarUrl,
  masked,
  promptpayType,
  isOwner,
}: {
  name: string;
  avatarUrl: string | null;
  masked: string;
  promptpayType: PromptPayType;
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<PromptPayType>(promptpayType);
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(async (prev, fd) => {
    const r = await updateProfileAction(prev, fd);
    if (r.ok) setEditing(false);
    return r;
  }, {});
  const err = state.errors ?? {};
  const k = KINDS.find((x) => x.id === kind)!;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center gap-3.5">
        {editing ? (
          <AvatarUpload action={uploadAvatarAction} initialUrl={avatarUrl} initial={name.slice(0, 2)} />
        ) : (
          <>
            <div
              aria-hidden="true"
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-accent bg-[#2B2420] text-[19px] font-bold text-accent"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                Array.from(name).slice(0, 2).join("")
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-bold">{name}</div>
              <div className="text-sm text-muted">พร้อมเพย์ {masked}</div>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-11 rounded-full border border-line-strong px-3.5 text-sm font-semibold"
            >
              แก้ไข
            </button>
          </>
        )}
      </div>

      {editing && (
        <form action={formAction} noValidate className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="displayName" className="text-[15px] font-semibold">
              ชื่อวงหรือชื่อศิลปิน
            </label>
            <input id="displayName" name="displayName" defaultValue={name} autoComplete="off" aria-invalid={Boolean(err.displayName)} className={field(Boolean(err.displayName))} />
            {err.displayName && (
              <p role="alert" className="text-sm text-[#F0968E]">
                {err.displayName}
              </p>
            )}
          </div>
          {isOwner ? (
            <div className="flex flex-col gap-2">
              <span id="pp-label" className="text-[15px] font-semibold">
                พร้อมเพย์สำหรับรับทิป
              </span>
              <div role="group" aria-labelledby="pp-label" className="grid grid-cols-2 gap-2">
                {KINDS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={kind === o.id}
                    onClick={() => setKind(o.id)}
                    className={`h-[46px] rounded-full border text-[15px] font-semibold ${
                      kind === o.id ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-bg text-ink"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <input type="hidden" name="promptpayType" value={kind} />
              <label htmlFor="promptpayId" className="sr-only">
                เลขพร้อมเพย์
              </label>
              <input id="promptpayId" name="promptpayId" type="tel" inputMode="numeric" autoComplete="off" placeholder={k.placeholder} aria-invalid={Boolean(err.promptpayId)} className={field(Boolean(err.promptpayId))} />
              {err.promptpayId ? (
                <p role="alert" className="text-sm text-[#F0968E]">
                  {err.promptpayId}
                </p>
              ) : (
                <p className="text-[13px] text-muted">ใส่เลขใหม่ทุกครั้งที่บันทึก ปัจจุบัน {masked}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">พร้อมเพย์ {masked} (เฉพาะเจ้าของเพจที่แก้ได้)</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEditing(false)} className="h-12 rounded-[14px] border border-line-strong text-[15px] font-semibold">
              ยกเลิก
            </button>
            <button type="submit" disabled={pending} className="h-12 rounded-[14px] bg-accent text-[15px] font-bold text-on-accent disabled:opacity-60">
              บันทึก
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
