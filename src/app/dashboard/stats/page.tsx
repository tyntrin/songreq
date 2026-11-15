import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireCurrentPerformer } from "@/lib/performers/current";
import { getStats, type StatsPeriod } from "@/lib/stats/service";

export const dynamic = "force-dynamic";

const PERIODS: Array<{ id: StatsPeriod; label: string }> = [
  { id: "night", label: "คืนนี้" },
  { id: "week", label: "7 วัน" },
  { id: "month", label: "เดือนนี้" },
];
const EMPTY = "ยังไม่มีคำขอในช่วงนี้";
const fmt = (n: number) => n.toLocaleString("th-TH");

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const { performer } = await requireCurrentPerformer();
  const raw = (await searchParams).period;
  const p = Array.isArray(raw) ? raw[0] : raw;
  const period: StatsPeriod = p === "night" || p === "week" || p === "month" ? p : "month";
  const stats = await getStats(getDb(), performer.id, period, new Date());
  const topMax = Math.max(1, ...stats.topSongs.map((t) => t.count));

  return (
    <main className="flex flex-col gap-4 px-4 pt-[18px] pb-6">
      <h1 className="text-[22px] font-bold">สถิติ</h1>

      <nav
        aria-label="ช่วงเวลา"
        className="grid grid-cols-3 gap-1 rounded-full border border-line bg-surface p-1"
      >
        {PERIODS.map((o) => {
          const on = o.id === period;
          return (
            <Link
              key={o.id}
              href={`/dashboard/stats?period=${o.id}`}
              aria-current={on ? "true" : undefined}
              className={`flex min-h-[44px] items-center justify-center rounded-full text-[14px] font-semibold ${
                on ? "bg-accent text-on-accent" : "text-[#C9C0B5]"
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </nav>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="คำขอ" value={fmt(stats.requestCount)} />
        <Tile label="ทิปที่แจ้ง" value={`฿${fmt(stats.tipTotal)}`} accent />
        <Tile label="คืนที่เล่น" value={fmt(stats.nights)} />
      </div>
      <p className="-mt-1.5 text-[12px] text-placeholder">
        ยอดทิปคือที่ลูกค้ากด &quot;โอนแล้ว&quot; ระบบไม่ได้ตรวจกับธนาคาร
      </p>

      <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[16px] font-bold">เพลงที่ถูกขอบ่อย</h2>
        {stats.topSongs.length === 0 ? (
          <p className="text-[14px] text-muted">{EMPTY}</p>
        ) : (
          stats.topSongs.map((t) => (
            <div key={t.title} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2.5 text-[14px]">
                <span className="truncate font-semibold">{t.title}</span>
                <span className="shrink-0 text-muted">{fmt(t.count)} ครั้ง</span>
              </div>
              <div className="h-2 rounded bg-[#2B2420]">
                <div
                  className="h-2 rounded bg-accent"
                  style={{ width: `${Math.round((t.count / topMax) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-1.5 text-[16px] font-bold">แยกตาม QR</h2>
        {stats.bySetlist.length === 0 ? (
          <p className="text-[14px] text-muted">{EMPTY}</p>
        ) : (
          stats.bySetlist.map((s, i) => (
            <div
              key={s.setlistId}
              className={`flex justify-between gap-2.5 py-2 text-[15px] ${
                i < stats.bySetlist.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 text-muted">{fmt(s.count)} คำขอ</span>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-3">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`text-[24px] font-bold ${accent ? "text-accent" : ""}`}>{value}</div>
    </div>
  );
}
