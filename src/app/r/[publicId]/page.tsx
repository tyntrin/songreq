import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getCustomerLocale } from "@/lib/i18n/server";
import { getPublicSetlist } from "@/lib/setlists/service";
import { RequestFlow } from "./RequestFlow";

export default async function CustomerPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const data = await getPublicSetlist(getDb(), publicId);
  if (!data) notFound();
  const locale = await getCustomerLocale();
  return (
    <div lang={locale} className="mx-auto min-h-dvh max-w-[480px]">
      <RequestFlow
        publicId={publicId}
        locale={locale}
        displayName={data.performer.displayName}
        avatarUrl={data.performer.avatarUrl}
        accepting={data.performer.acceptingRequests}
        songs={data.songs}
        tags={data.tags}
      />
    </div>
  );
}
