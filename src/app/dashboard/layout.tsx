import { requireCurrentPerformer } from "@/lib/performers/current";
import { TabBar } from "@/components/tab-bar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireCurrentPerformer();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md pb-[110px]">
      {children}
      <TabBar />
    </div>
  );
}
