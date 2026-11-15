import Link from "next/link";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { listMyPerformers } from "@/lib/performers/service";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "ใส่เพลง",
    body: "ค้นหาหรือพิมพ์เพลงที่คุณเล่นได้ รวมเป็นรายการเดียว ไม่ต้องใส่เนื้อเพลง",
    icon: <path d="M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  },
  {
    title: "พิมพ์ QR",
    body: "ดาวน์โหลดโปสเตอร์ A5 พิมพ์วางบนโต๊ะ ลูกค้าสแกนแล้วเลือกเพลงได้เลย",
    icon: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <path d="M14 14h2v2h-2zM18 18h2M14 20h2M20 14v2" />
      </>
    ),
  },
  {
    title: "ดูคำขอบนจอ",
    body: "คำขอขึ้นจอมือถือระหว่างเล่น ไม่ต้องกดอะไร ทิปเข้าพร้อมเพย์ของคุณตรง ๆ",
    icon: (
      <>
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M10 8h4M10 12h4M11 17h2" />
      </>
    ),
  },
];

export default async function Home() {
  let hasPerformer = false;
  try {
    const session = await auth();
    if (session?.user?.id) {
      hasPerformer = (await listMyPerformers(getDb(), session.user.id)).length > 0;
    }
  } catch {
    hasPerformer = false;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-14">
      <div className="flex flex-1 flex-col gap-9">
        <div className="flex flex-col gap-7">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent"
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1A1408" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="text-sm font-semibold text-muted">songreq สำหรับนักดนตรี</div>
            <h1 className="m-0 text-[32px] font-bold leading-tight">
              ให้ลูกค้าขอเพลง
              <br />
              ผ่าน QR ได้ในคืนนี้
            </h1>
            <p className="m-0 text-base leading-relaxed text-[#c9c0b5]">
              ใส่เพลงที่เล่นได้ พิมพ์ QR วางบนโต๊ะ แล้วดูคำขอขึ้นจอระหว่างเล่น ทิปเข้าพร้อมเพย์ของคุณตรง ๆ
            </p>
            <div className="mt-1 inline-flex w-fit items-center rounded-full border border-accent px-3.5 py-1 text-sm font-semibold text-accent">
              ใช้ฟรี
            </div>
          </div>
        </div>

        <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="3 ขั้นตอน">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="flex gap-3.5 rounded-[18px] border border-line bg-surface p-4"
            >
              <div
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F5B544" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {s.icon}
                </svg>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="m-0 text-[17px] font-bold">
                  <span className="text-accent">{i + 1}.</span> {s.title}
                </h2>
                <p className="m-0 text-[14px] leading-normal text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-9 flex flex-col gap-3">
        <Link
          href={hasPerformer ? "/dashboard" : "/login"}
          className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-accent text-[17px] font-bold text-on-accent"
        >
          {hasPerformer ? "ไปที่แดชบอร์ด" : "เริ่มใช้ฟรี"}
        </Link>
        <p className="m-0 text-center text-sm leading-relaxed text-muted">
          สำหรับลูกค้า: สแกน QR ที่โต๊ะได้เลย ไม่ต้องสมัคร
        </p>
        <footer className="mt-2 text-center text-xs text-placeholder">
          <Link href="/privacy" className="inline-flex min-h-11 items-center text-accent underline">
            นโยบายความเป็นส่วนตัว
          </Link>
        </footer>
      </div>
    </main>
  );
}
