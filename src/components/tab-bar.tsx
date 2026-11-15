"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  requests: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  songs: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  setlists: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4" />
    </>
  ),
  stats: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
};

const TABS = [
  { id: "requests", href: "/dashboard/requests", label: "คำขอ" },
  { id: "songs", href: "/dashboard/songs", label: "เพลง" },
  { id: "setlists", href: "/dashboard/setlists", label: "QR" },
  { id: "stats", href: "/dashboard/stats", label: "สถิติ" },
  { id: "settings", href: "/dashboard/settings", label: "ตั้งค่า" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-[#1B1714] px-2 pb-[22px] pt-2"
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.id}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs ${
                active ? "font-semibold text-accent" : "text-muted"
              }`}
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ICONS[t.id]}
              </svg>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
