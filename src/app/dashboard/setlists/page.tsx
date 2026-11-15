import Link from "next/link";
import QRCode from "qrcode";
import { getDb } from "@/lib/db/client";
import { requireCurrentPerformer } from "@/lib/performers/current";
import { listSetlists } from "@/lib/setlists/service";
import { getAppUrl } from "@/lib/app-url";
import { publicSetlistUrl } from "@/components/qr-poster-lib";
import { QrPoster } from "@/components/QrPoster";
import { CreateSetlist } from "./CreateSetlist";

export const dynamic = "force-dynamic";

export default async function SetlistsPage() {
  const { performer } = await requireCurrentPerformer();
  const [lists, appUrl] = await Promise.all([
    listSetlists(getDb(), performer.id, new Date()),
    getAppUrl(),
  ]);
  const cards = await Promise.all(
    lists.map(async (l) => {
      const url = publicSetlistUrl(appUrl, l.publicId);
      const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 0,
        color: { dark: "#14110F", light: "#FFFFFF" },
      });
      return { ...l, url, svg };
    }),
  );

  return (
    <main className="flex flex-col gap-4 px-4 pt-[18px]">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[22px] font-bold">Setlist และ QR</h1>
        <p className="m-0 text-[14px] leading-normal text-muted">
          เล่นหลายร้าน ใช้ QR แยกกัน ระบบแยกคำขอให้เอง
        </p>
      </div>

      {cards.map((c) => (
        <article
          key={c.id}
          className="relative flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-4"
        >
          <div className="flex gap-3.5">
            <div
              role="img"
              aria-label="ตัวอย่างโปสเตอร์ QR"
              className="flex h-[150px] w-[112px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[10px] border border-line-strong bg-bg p-2"
            >
              <div className="text-[10px] font-bold text-accent">สแกนขอเพลง</div>
              <div
                aria-hidden="true"
                className="size-[70px] rounded-md bg-white p-[5px] [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: c.svg }}
              />
              <div className="line-clamp-2 text-center text-[11px] font-bold">
                {performer.displayName}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h2 className="m-0 break-words text-[19px] font-bold">{c.name}</h2>
              <div className="text-[14px] text-muted">{c.songCount} เพลง</div>
              <div className="text-[14px] text-muted">
                คำขอคืนนี้{" "}
                <span className="font-semibold text-accent">{c.requestsTonight}</span>
              </div>
              <Link
                href={`/dashboard/setlists/${c.id}`}
                className="mt-auto flex min-h-11 items-center text-[14px] font-semibold text-accent"
              >
                แก้รายการเพลง
              </Link>
            </div>
          </div>
          <QrPoster url={c.url} displayName={performer.displayName} setlistName={c.name} />
        </article>
      ))}

      <CreateSetlist />
    </main>
  );
}
