import { getDb } from "@/lib/db/client";
import { requireCurrentPerformer } from "@/lib/performers/current";
import { listMembers, listMyPerformers } from "@/lib/performers/service";
import { maskPromptPay } from "@/lib/promptpay/promptpay";
import { signOutAction, switchPerformerAction } from "./actions";
import { InviteButton, RemoveMemberButton } from "./InviteMembers";
import { ProfileCard } from "./ProfileCard";
import { AcceptSwitch, SoundSwitch } from "./Toggles";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, performer } = await requireCurrentPerformer();
  const db = getDb();
  const [members, mine] = await Promise.all([listMembers(db, performer.id), listMyPerformers(db, user.id)]);
  const isOwner = performer.role === "owner";

  return (
    <main className="flex flex-col gap-4 px-4 pt-[18px] pb-6">
      <h1 className="text-[22px] font-bold">ตั้งค่า</h1>

      {mine.length > 1 && (
        <form action={switchPerformerAction} className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
          <label htmlFor="performerId" className="text-[15px] font-semibold">
            เพจ
          </label>
          <select id="performerId" name="performerId" defaultValue={performer.id} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-[15px] text-ink">
            {mine.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <button type="submit" className="h-11 rounded-full bg-accent px-4 text-sm font-bold text-on-accent">
            สลับ
          </button>
        </form>
      )}

      <ProfileCard
        key={performer.id}
        name={performer.displayName}
        avatarUrl={performer.avatarUrl}
        masked={maskPromptPay(performer.promptpayType, performer.promptpayId)}
        promptpayType={performer.promptpayType}
        isOwner={isOwner}
      />

      <section className="flex flex-col rounded-2xl border border-line bg-surface px-4 py-1">
        <AcceptSwitch initial={performer.acceptingRequests} />
        <SoundSwitch />
      </section>

      <section className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5">
        <h2 className="mb-1.5 text-base font-bold">สมาชิกวง</h2>
        {members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 py-1">
            <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2B2420] text-sm font-bold text-[#C9C0B5]">
              {Array.from(m.name)[0]}
            </div>
            <div className="min-w-0 flex-1 truncate text-[15px]">
              {m.name}
              {m.userId === user.id && <span className="text-muted"> (คุณ)</span>}
            </div>
            <span className="text-[13px] text-muted">{m.role === "owner" ? "เจ้าของ" : "สมาชิก"}</span>
            {isOwner && m.role !== "owner" && m.userId !== user.id && <RemoveMemberButton userId={m.userId} name={m.name} />}
          </div>
        ))}
        {isOwner && <InviteButton />}
      </section>

      <form action={signOutAction} className="flex justify-center">
        <button type="submit" className="h-11 px-4 text-[15px] text-[#E39B8B]">
          ออกจากระบบ
        </button>
      </form>
    </main>
  );
}
