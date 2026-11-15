"use client";

import { useRef, useState, useTransition } from "react";

export type AvatarResult = { url?: string; error?: string };
const MAX = 2 * 1024 * 1024;

export function AvatarUpload({
  action,
  initialUrl,
  initial,
  hiddenName,
}: {
  action: (fd: FormData) => Promise<AvatarResult>;
  initialUrl: string | null;
  initial: string;
  /** When set, the uploaded URL is mirrored into a hidden input with this name (setup form). */
  hiddenName?: string;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const onPick = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("ใช้ไฟล์ JPG, PNG หรือ WebP เท่านั้น");
      return;
    }
    if (file.size > MAX) {
      setError("ไฟล์ใหญ่เกิน 2 MB");
      return;
    }
    const local = URL.createObjectURL(file);
    setPreview(local);
    const fd = new FormData();
    fd.set("avatar", file);
    start(async () => {
      try {
        const r = await action(fd);
        if (r.error) {
          setError(r.error);
          setPreview(null);
        } else if (r.url) {
          setUrl(r.url);
        }
      } catch {
        setError("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
        setPreview(null);
      }
    });
  };

  const shown = preview ?? url;
  return (
    <div className="flex items-center gap-3.5">
      <div
        aria-hidden="true"
        className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-accent bg-[#2B2420] text-[21px] font-bold text-accent"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          className="h-11 rounded-full border border-line-strong px-4 text-[14px] font-semibold text-ink disabled:opacity-60"
        >
          {pending ? "กำลังอัปโหลด..." : shown ? "เปลี่ยนรูป" : "เพิ่มรูปโปรไฟล์"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="เลือกรูปโปรไฟล์"
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error ? (
          <p role="alert" className="text-[13px] text-[#F0968E]">
            {error}
          </p>
        ) : (
          <p className="text-[12px] text-muted">JPG, PNG, WebP ไม่เกิน 2 MB</p>
        )}
      </div>
      {hiddenName && <input type="hidden" name={hiddenName} value={url ?? ""} />}
    </div>
  );
}
