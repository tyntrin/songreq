"use client";

import { useActionState, useState } from "react";
import { createPerformerAction, type SetupState } from "./actions";
import type { PromptPayType } from "@/lib/promptpay/promptpay";

const KINDS: Array<{ id: PromptPayType; label: string; placeholder: string; sr: string }> = [
  { id: "phone", label: "เบอร์มือถือ", placeholder: "08x-xxx-xxxx", sr: "เบอร์มือถือพร้อมเพย์" },
  { id: "national_id", label: "เลขบัตรประชาชน", placeholder: "x-xxxx-xxxxx-xx-x", sr: "เลขบัตรประชาชนพร้อมเพย์" },
];

export function SetupForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(createPerformerAction, {});
  const [kind, setKind] = useState<PromptPayType>(state.values?.promptpayType ?? "phone");
  const k = KINDS.find((x) => x.id === kind)!;
  const err = state.errors ?? {};

  return (
    <form action={formAction} noValidate className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 pb-36 pt-7">
        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] font-semibold text-accent">ขั้นตอนเดียว ใช้ไม่ถึงนาที</div>
          <h1 className="text-[26px] font-bold leading-tight">ตั้งค่าเพจของคุณ</h1>
          <p className="text-[15px] leading-normal text-muted">ลูกค้าจะเห็นชื่อนี้ตอนสแกน QR</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="displayName" className="text-[15px] font-semibold">
            ชื่อวงหรือชื่อศิลปิน
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="off"
            defaultValue={state.values?.displayName ?? ""}
            aria-invalid={Boolean(err.displayName)}
            aria-describedby={err.displayName ? "displayName-err" : undefined}
            className={`h-[50px] rounded-[14px] border bg-surface px-3.5 text-[17px] text-ink outline-none focus:border-accent ${
              err.displayName ? "border-[#E5736A]" : "border-line"
            }`}
          />
          {err.displayName && (
            <p id="displayName-err" role="alert" className="text-sm text-[#F0968E]">
              {err.displayName}
            </p>
          )}
        </div>

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
                  kind === o.id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line-strong bg-surface text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="promptpayType" value={kind} />
          <label htmlFor="promptpayId" className="sr-only">
            {k.sr}
          </label>
          <input
            id="promptpayId"
            name="promptpayId"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            placeholder={k.placeholder}
            defaultValue={state.values?.promptpayId ?? ""}
            aria-invalid={Boolean(err.promptpayId)}
            aria-describedby={err.promptpayId ? "promptpayId-err" : undefined}
            className={`h-[50px] rounded-[14px] border bg-surface px-3.5 text-[17px] text-ink outline-none focus:border-accent ${
              err.promptpayId ? "border-[#E5736A]" : "border-line"
            }`}
          />
          {err.promptpayId && (
            <p id="promptpayId-err" role="alert" className="text-sm text-[#F0968E]">
              {err.promptpayId}
            </p>
          )}
          <p className="text-[13px] leading-normal text-muted">
            ลูกค้าจะเห็นแค่ 4 ตัวท้าย เงินโอนเข้าบัญชีคุณโดยตรง แอพไม่ได้แตะเงิน
          </p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-[#1B1714] px-5 pb-[30px] pt-3.5">
        <button
          type="submit"
          disabled={pending}
          className="mx-auto flex h-[54px] w-full max-w-md items-center justify-center rounded-[14px] bg-accent text-[17px] font-bold text-on-accent disabled:opacity-60"
        >
          ถัดไป: ใส่เพลงที่เล่นได้
        </button>
      </div>
    </form>
  );
}
