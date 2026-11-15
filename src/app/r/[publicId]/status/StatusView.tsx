"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n/customer";
import type { DeviceRequestStatus } from "@/lib/requests/service";

const iconProps = {
  "aria-hidden": true,
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
} as const;

export function StatusView({
  publicId,
  locale,
  displayName,
  initial,
}: {
  publicId: string;
  locale: Locale;
  displayName: string;
  initial: DeviceRequestStatus[];
}) {
  const [reqs, setReqs] = useState(initial);

  useEffect(() => {
    let alive = true;
    let poll: ReturnType<typeof setInterval> | null = null;
    const refetch = async () => {
      try {
        const res = await fetch(`/api/r/${publicId}/status`, { cache: "no-store" });
        if (res.ok && alive) setReqs(((await res.json()) as { requests: DeviceRequestStatus[] }).requests);
      } catch {
        /* keep last known state */
      }
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const es = new EventSource(`/api/r/${publicId}/stream`);
    es.onopen = stopPoll;
    es.onmessage = () => void refetch();
    es.onerror = () => {
      poll ??= setInterval(() => void refetch(), 15000);
    };
    return () => {
      alive = false;
      es.close();
      stopPoll();
    };
  }, [publicId]);

  const items = reqs.flatMap((r) => r.items);
  const claimed = reqs.filter((r) => r.tipClaimed && r.tipAmount > 0);

  return (
    <>
      <main className="flex flex-col gap-6 px-5 pb-36 pt-9">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-accent">
            <svg width={32} height={32} stroke="#1A1408" strokeWidth={2.6} {...iconProps}>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="m-0 break-words text-2xl font-bold">{t(locale, "sentTo", { name: displayName })}</h1>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-sm font-semibold text-muted">{t(locale, "yourSongs")}</h2>
          {items.length === 0 && <p className="m-0 text-sm text-muted">{t(locale, "noRequestsYet")}</p>}
          {items.map((it) => (
            <div
              key={it.itemId}
              className="flex items-center gap-3.5 rounded-[14px] border border-line bg-surface px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold">{it.title}</div>
                <div className="text-sm text-muted">{it.artist}</div>
              </div>
              {it.status === "seen" ? (
                <div className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#2B2218] px-2.5 py-1 text-[13px] font-semibold text-accent">
                  <svg width={14} height={14} stroke="#F5B544" strokeWidth={2.4} {...iconProps}>
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {t(locale, "statusSeen")}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#26211D] px-2.5 py-1 text-[13px] font-semibold text-[#C9C0B5]">
                  <svg width={14} height={14} stroke="#C9C0B5" strokeWidth={2.4} {...iconProps}>
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                  {t(locale, "statusSent")}
                </div>
              )}
            </div>
          ))}
        </section>

        {claimed.map((r) => (
          <div key={r.requestId} className="flex items-center gap-3 rounded-[14px] bg-[#2B2218] px-4 py-3.5">
            <svg width={22} height={22} stroke="#F5B544" strokeWidth={2} {...iconProps} className="shrink-0">
              <path d="M12 21s-7-4.4-9.2-9A5 5 0 0 1 12 6.5 5 5 0 0 1 21.2 12C19 16.6 12 21 12 21z" />
            </svg>
            <div className="text-sm leading-normal text-[#E9DFD3]">
              {t(locale, "tipClaimed", { amount: r.tipAmount })}
              <br />
              <span className="text-muted">{t(locale, "tipThanks")}</span>
            </div>
          </div>
        ))}

        <p className="m-0 text-center text-[13px] leading-relaxed text-placeholder">
          {t(locale, "statusFooter")}
        </p>
      </main>
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px] border-t border-line bg-[#1B1714] px-5 pb-[30px] pt-3.5">
        <Link
          href={`/r/${publicId}`}
          className="flex h-[54px] items-center justify-center rounded-[14px] border border-accent bg-surface text-[17px] font-bold text-accent"
        >
          {t(locale, "requestMore")}
        </Link>
      </div>
    </>
  );
}
