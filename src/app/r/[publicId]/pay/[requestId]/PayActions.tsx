"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n/customer";

export function PayActions({
  publicId,
  requestId,
  locale,
  payload,
  fileName,
}: {
  publicId: string;
  requestId: string;
  locale: Locale;
  payload: string;
  fileName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const statusHref = `/r/${publicId}/status`;

  async function save() {
    // Loaded on demand so the QR library stays out of the initial bundle.
    const QRCode = (await import("qrcode")).default;
    const url = await QRCode.toDataURL(payload, { margin: 4, width: 640 });
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function claim() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/requests/${requestId}/claim-tip`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      router.push(statusHref);
    } catch {
      setPending(false);
      setError(true);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-[480px] flex-col gap-2.5 border-t border-line bg-[#1B1714] px-5 pb-[30px] pt-3.5">
      {error && (
        <p role="alert" className="m-0 text-center text-sm text-[#F2A38C]">
          {t(locale, "networkError")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={save}
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] border border-line-strong bg-surface text-base font-semibold text-ink"
        >
          <svg
            aria-hidden="true"
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#F4EFE8"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          {t(locale, "saveQr")}
        </button>
        <button
          type="button"
          onClick={claim}
          disabled={pending}
          className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-base font-bold text-on-accent disabled:opacity-50"
        >
          {t(locale, "paid")}
        </button>
      </div>
      <Link href={statusHref} className="flex min-h-11 items-center justify-center self-center px-2.5 text-sm text-accent">
        {t(locale, "skip")}
      </Link>
    </div>
  );
}
