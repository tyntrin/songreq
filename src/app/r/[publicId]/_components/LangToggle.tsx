"use client";

import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n/customer";

export function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const next: Locale = locale === "th" ? "en" : "th";
  return (
    <button
      type="button"
      aria-label={t(locale, "langToggle")}
      onClick={() => {
        document.cookie = `sr_lang=${next}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      className="min-h-11 rounded-full border border-line-strong px-3 text-[13px] text-[#C9C0B5]"
    >
      <span className={locale === "th" ? "font-bold text-ink" : ""}>TH</span>
      {" · "}
      <span className={locale === "en" ? "font-bold text-ink" : ""}>EN</span>
    </button>
  );
}
