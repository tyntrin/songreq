"use client";

import { useRef, useState } from "react";
import { POSTER_H, POSTER_W, posterLayout, safeFileName } from "./qr-poster-lib";

const BG = "#14110F";
const INK = "#F4EFE8";
const MUTED = "#A89F94";
const ACCENT = "#F5B544";

function download(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

/** Draws the QR modules (dark on white, no quiet zone of its own) into the square at x,y,size. */
async function drawQr(
  ctx: CanvasRenderingContext2D,
  url: string,
  x: number,
  y: number,
  size: number,
) {
  const QRCode = (await import("qrcode")).default;
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  ctx.fillStyle = "#14110F";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) {
        // ceil to avoid hairline seams between modules
        ctx.fillRect(
          Math.floor(x + c * cell),
          Math.floor(y + r * cell),
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
    }
  }
}

export async function renderPosterPng(opts: {
  displayName: string;
  url: string;
  size: "a5";
}): Promise<Blob> {
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  await document.fonts.ready;
  await Promise.all(
    ["400", "600", "700"].map((w) =>
      document.fonts.load(`${w} 64px ${family}`, "สแกนขอเพลง Scan ไม่ต้องโหลดแอพ").catch(() => []),
    ),
  );
  const L = posterLayout();
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = ACCENT;
  ctx.font = `700 150px ${family}`;
  ctx.fillText("สแกนขอเพลง", POSTER_W / 2, L.headingY);
  ctx.fillStyle = MUTED;
  ctx.font = `400 56px ${family}`;
  ctx.fillText("Scan to request a song", POSTER_W / 2, L.subheadingY);

  const b = L.qrBox;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.size, b.size, b.radius);
  ctx.fill();
  await drawQr(ctx, opts.url, b.x + b.padding, b.y + b.padding, b.size - b.padding * 2);

  ctx.fillStyle = INK;
  let fontPx = 120;
  ctx.font = `700 ${fontPx}px ${family}`;
  while (ctx.measureText(opts.displayName).width > POSTER_W - 200 && fontPx > 48) {
    fontPx -= 6;
    ctx.font = `700 ${fontPx}px ${family}`;
  }
  ctx.fillText(opts.displayName, POSTER_W / 2, L.nameY);

  ctx.fillStyle = MUTED;
  ctx.font = `400 54px ${family}`;
  ctx.fillText("ไม่ต้องโหลดแอพ · ไม่ต้องล็อกอิน", POSTER_W / 2, L.footerY);

  return toBlob(canvas);
}

export async function renderQrPng(url: string, px = 1024): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, px, px);
  const margin = Math.round(px * 0.08);
  await drawQr(ctx, url, margin, margin, px - margin * 2);
  return toBlob(canvas);
}

const btnPrimary =
  "flex h-[46px] items-center justify-center gap-1.5 rounded-xl bg-accent text-[15px] font-bold text-on-accent disabled:opacity-60";
const btnGhost =
  "flex h-[46px] items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-bg text-[15px] font-semibold text-ink";

export function QrPoster({
  url,
  displayName,
  setlistName,
}: {
  url: string;
  displayName: string;
  setlistName: string;
}) {
  const [busy, setBusy] = useState<"poster" | "qr" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function run(kind: "poster" | "qr") {
    if (busy) return;
    setBusy(kind);
    setError(false);
    try {
      if (kind === "poster") {
        const blob = await renderPosterPng({ displayName, url, size: "a5" });
        download(blob, `poster-${safeFileName(setlistName)}.png`);
      } else {
        download(await renderQrPng(url, 1024), `qr-${safeFileName(setlistName)}.png`);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      const el = inputRef.current;
      if (el) {
        el.select();
        el.setSelectionRange(0, url.length);
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
      }
    }
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => run("poster")}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          {busy === "poster" ? "กำลังสร้าง…" : "โปสเตอร์ A5"}
        </button>
        <button type="button" className={btnGhost} onClick={copy}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a1 1 0 0 1 1-1h10" />
          </svg>
          <span aria-live="polite">{copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}</span>
        </button>
      </div>
      <button
        type="button"
        className="h-11 text-[14px] font-semibold text-accent disabled:opacity-60"
        disabled={busy !== null}
        onClick={() => run("qr")}
      >
        {busy === "qr" ? "กำลังสร้าง…" : "ดาวน์โหลด QR (PNG)"}
      </button>
      {error && (
        <p role="alert" className="m-0 text-center text-[14px] text-[#F2A38C]">
          สร้างไฟล์ไม่สำเร็จ ลองอีกครั้ง
        </p>
      )}
      <input
        ref={inputRef}
        readOnly
        value={url}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </div>
  );
}
