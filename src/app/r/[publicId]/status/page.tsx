import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getCustomerLocale } from "@/lib/i18n/server";
import { readDeviceId } from "@/lib/requests/device";
import { getDeviceStatus } from "@/lib/requests/service";
import { getPublicSetlist } from "@/lib/setlists/service";
import { StatusView } from "./StatusView";

export default async function StatusPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const db = getDb();
  const data = await getPublicSetlist(db, publicId);
  if (!data) notFound();
  const deviceId = await readDeviceId();
  const initial = deviceId ? await getDeviceStatus(db, data.performer.id, deviceId, new Date()) : [];
  const locale = await getCustomerLocale();
  return (
    <div lang={locale} className="mx-auto min-h-dvh max-w-[480px]">
      <StatusView
        publicId={publicId}
        locale={locale}
        displayName={data.performer.displayName}
        initial={initial}
      />
    </div>
  );
}
