import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import { t } from "@/lib/i18n/customer";
import { getCustomerLocale } from "@/lib/i18n/server";
import { buildPromptPayPayload, maskPromptPay } from "@/lib/promptpay/promptpay";
import { readDeviceId } from "@/lib/requests/device";
import { getPublicSetlist } from "@/lib/setlists/service";
import { LangToggle } from "../../_components/LangToggle";
import { PayActions } from "./PayActions";

export default async function PayPage({
  params,
}: {
  params: Promise<{ publicId: string; requestId: string }>;
}) {
  const { publicId, requestId } = await params;
  const db = getDb();
  const data = await getPublicSetlist(db, publicId);
  const deviceId = await readDeviceId();
  if (!data || !deviceId) notFound();
  const [req] = await db
    .select({ tipAmount: requests.tipAmount, tipClaimedAt: requests.tipClaimedAt })
    .from(requests)
    .where(
      and(
        eq(requests.id, requestId),
        eq(requests.performerId, data.performer.id),
        eq(requests.deviceId, deviceId),
        isNull(requests.hiddenAt),
      ),
    );
  if (!req) notFound();
  if (req.tipAmount <= 0 || req.tipClaimedAt) redirect(`/r/${publicId}/status`);

  const locale = await getCustomerLocale();
  const { displayName, promptpayType, promptpayId } = data.performer;
  const payload = buildPromptPayPayload(promptpayType, promptpayId, req.tipAmount);
  const svg = await QRCode.toString(payload, { type: "svg", margin: 1 });
  const masked = maskPromptPay(promptpayType, promptpayId);

  return (
    <div lang={locale} className="mx-auto min-h-dvh max-w-[480px]">
      <main className="flex flex-col gap-[18px] px-5 pb-48 pt-4">
        <div className="flex items-center gap-2">
          <h1 className="m-0 min-w-0 flex-1 break-words text-[22px] font-bold">
            {t(locale, "payTitle", { name: displayName })}
          </h1>
          <LangToggle locale={locale} />
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <div className="text-sm text-muted">{t(locale, "tipAmount")}</div>
          <div className="text-[44px] font-bold leading-[1.1] text-accent">฿{req.tipAmount}</div>
        </div>

        <div className="flex flex-col items-center gap-3 self-center rounded-[20px] bg-white p-5 text-bg">
          <div
            role="img"
            aria-label={t(locale, "qrAlt", { amount: req.tipAmount })}
            className="size-[236px] [&>svg]:size-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="flex flex-col items-center gap-0.5">
            <div className="text-[15px] font-semibold">
              {t(locale, "promptpayName", { name: displayName })}
            </div>
            <div className="text-sm text-[#5A524B]">
              {t(locale, promptpayType === "phone" ? "phoneMasked" : "idMasked", { id: masked })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-surface px-4 py-3.5">
          <div className="text-[15px] font-semibold">{t(locale, "howTo")}</div>
          <ol className="m-0 list-decimal pl-5 text-sm leading-[1.7] text-[#D8CFC4]">
            <li>{t(locale, "how1")}</li>
            <li>{t(locale, "how2")}</li>
            <li>{t(locale, "how3")}</li>
          </ol>
        </div>
      </main>
      <PayActions
        publicId={publicId}
        requestId={requestId}
        locale={locale}
        payload={payload}
        fileName={`tip-${displayName.replace(/[\\/:*?"<>|\s]+/g, "_")}-${req.tipAmount}.png`}
      />
    </div>
  );
}
