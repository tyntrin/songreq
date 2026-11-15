import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { isAdminEmail } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/session";
import { getAdminOverview } from "@/lib/admin/service";
import { deleteRequestAction, setSuspendedAction } from "./actions";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" });
const th = "whitespace-nowrap border-b border-line-strong px-3 py-2 text-left text-[13px] font-semibold text-muted";
const td = "border-b border-line px-3 py-2 align-top text-[14px]";

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email, process.env)) notFound();
  const o = await getAdminOverview(getDb(), new Date());

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <h1 className="text-[22px] font-bold">ผู้ดูแลระบบ</h1>

      <section className="grid grid-cols-3 gap-3">
        {[
          ["เพจนักดนตรี", o.totals.performers],
          ["คำขอ 7 วันล่าสุด", o.totals.last7Days],
          ["คำขอทั้งหมด", o.totals.allTime],
        ].map(([label, n]) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-3">
            <div className="text-[13px] text-muted">{label}</div>
            <div className="text-[24px] font-bold">{Number(n).toLocaleString("th-TH")}</div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">เพจนักดนตรี</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={th}>ชื่อ</th>
                <th className={th}>slug</th>
                <th className={th}>สร้างเมื่อ</th>
                <th className={th}>สมาชิก</th>
                <th className={th}>สถานะ</th>
                <th className={th}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {o.performers.map((p) => (
                <tr key={p.id}>
                  <td className={td}>{p.name}</td>
                  <td className={`${td} text-muted`}>{p.slug}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmt.format(p.createdAt)}</td>
                  <td className={td}>{p.members}</td>
                  <td className={td}>{p.suspendedAt ? "ระงับอยู่" : "ปกติ"}</td>
                  <td className={td}>
                    <form action={setSuspendedAction}>
                      <input type="hidden" name="performerId" value={p.id} />
                      <input type="hidden" name="suspend" value={p.suspendedAt ? "0" : "1"} />
                      <button type="submit" className="h-11 rounded-full border border-line-strong px-3.5 text-[13px] font-semibold">
                        {p.suspendedAt ? "เลิกระงับ" : "ระงับ"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">คำขอล่าสุด 50 รายการ</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className={th}>เวลา</th>
                <th className={th}>เพจ</th>
                <th className={th}>เพลง</th>
                <th className={th}>ชื่อ / ข้อความ</th>
                <th className={th}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {o.requests.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap`}>{fmt.format(r.createdAt)}</td>
                  <td className={td}>{r.performer}</td>
                  <td className={td}>{r.songs.join(", ")}</td>
                  <td className={td}>
                    {r.requesterName ?? "-"}
                    {r.message && <div className="text-muted">{r.message}</div>}
                  </td>
                  <td className={td}>
                    <form action={deleteRequestAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <button type="submit" className="h-11 rounded-full border border-line-strong px-3.5 text-[13px] font-semibold text-[#E39B8B]">
                        ลบ
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {o.requests.length === 0 && (
                <tr>
                  <td className={`${td} text-muted`} colSpan={5}>
                    ยังไม่มีคำขอ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
