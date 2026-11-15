import { t, type Locale } from "@/lib/i18n/customer";
import { LangToggle } from "./LangToggle";

function initials(name: string): string {
  const seg = new Intl.Segmenter("th", { granularity: "grapheme" });
  const words = name.trim().split(/\s+/).filter(Boolean);
  const take = (s: string, n: number) =>
    Array.from(seg.segment(s), (x) => x.segment).slice(0, n).join("");
  const out = words.length > 1 ? take(words[0], 1) + take(words[1], 1) : take(words[0] ?? "", 2);
  return out.toUpperCase();
}

export function Header({
  locale,
  displayName,
  avatarUrl,
  open,
}: {
  locale: Locale;
  displayName: string;
  avatarUrl: string | null;
  open: boolean;
}) {
  return (
    <>
      <div className="flex justify-end">
        <LangToggle locale={locale} />
      </div>
      <div className="flex items-center gap-3.5">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            width={60}
            height={60}
            className={`size-[60px] shrink-0 rounded-full border-2 object-cover ${open ? "border-accent" : "border-[#5A4F45]"}`}
          />
        ) : (
          <div
            aria-hidden="true"
            className={`flex size-[60px] shrink-0 items-center justify-center rounded-full border-2 bg-[#2B2420] text-[22px] font-bold ${open ? "border-accent text-accent" : "border-[#5A4F45] text-muted"}`}
          >
            {initials(displayName)}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 break-words text-2xl font-bold leading-tight">{displayName}</h1>
          <div
            className={`inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-[3px] text-[13px] font-semibold ${open ? "bg-[#24301F] text-[#A8E08F]" : "bg-[#26211D] text-[#C9C0B5]"}`}
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${open ? "bg-[#7FD35E]" : "bg-[#7A7068]"}`}
            />
            {t(locale, open ? "statusOpen" : "statusPaused")}
          </div>
        </div>
      </div>
    </>
  );
}
