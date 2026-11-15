import { signIn } from "@/auth";
import { isDevLoginEnabled } from "@/lib/auth/dev-login";

export const dynamic = "force-dynamic";

function safeNext(next: string | string[] | undefined): string {
  const v = Array.isArray(next) ? next[0] : next;
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const redirectTo = safeNext((await searchParams).next);
  const env = process.env;
  const hasLine = Boolean(env.AUTH_LINE_ID && env.AUTH_LINE_SECRET);
  const hasGoogle = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  const dev = isDevLoginEnabled(env);

  async function lineAction() {
    "use server";
    await signIn("line", { redirectTo });
  }
  async function googleAction() {
    "use server";
    await signIn("google", { redirectTo });
  }
  async function devAction(formData: FormData) {
    "use server";
    await signIn("dev", { email: String(formData.get("email") ?? ""), redirectTo });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-[72px]">
      <div className="flex flex-1 flex-col gap-7">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-accent"
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1A1408" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold text-muted">[ชื่อแอพ] สำหรับนักดนตรี</div>
          <h1 className="text-[32px] font-bold leading-tight">
            ให้ลูกค้าขอเพลง
            <br />
            ผ่าน QR ได้ในคืนนี้
          </h1>
          <p className="text-base leading-relaxed text-[#c9c0b5]">
            ใส่เพลงที่เล่นได้ พิมพ์ QR วางบนโต๊ะ แล้วดูคำขอขึ้นจอระหว่างเล่น ทิปเข้าพร้อมเพย์ของคุณตรง ๆ ใช้ฟรี
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {hasLine && (
          <form action={lineAction}>
            <button
              type="submit"
              className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#06C755] text-[17px] font-bold text-white"
            >
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5c0 4.1-4 7.5-9 7.5-1 0-2-.1-2.9-.4L5 20.5l1.1-3.6C4.2 15.6 3 13.6 3 11.5 3 7.4 7 4 12 4s9 3.4 9 7.5z" />
              </svg>
              เข้าสู่ระบบด้วย LINE
            </button>
          </form>
        )}
        {hasGoogle && (
          <form action={googleAction}>
            <button
              type="submit"
              className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-ink text-[17px] font-bold text-bg"
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14110F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h4.5a4.4 4.4 0 0 1-1.8 2.8v2.3h2.9c1.7-1.6 2.4-3.9 2.4-6.8z" />
                <path d="M12 21c2.4 0 4.5-.8 5.9-2.2L15 16.5c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.4A9 9 0 0 0 12 21z" />
                <path d="M7 13.7a5.4 5.4 0 0 1 0-3.4V7.9H4a9 9 0 0 0 0 8.2l3-2.4z" />
                <path d="M12 6.6c1.3 0 2.5.5 3.4 1.3L18 5.4A9 9 0 0 0 4 7.9l3 2.4c.7-2.1 2.7-3.7 5-3.7z" />
              </svg>
              เข้าสู่ระบบด้วย Google
            </button>
          </form>
        )}
        {dev && (
          <form action={devAction} className="flex flex-col gap-2 rounded-[14px] border border-line-strong bg-surface p-3">
            <label htmlFor="dev-email" className="text-sm text-muted">
              Dev login (เฉพาะตอนพัฒนา)
            </label>
            <input
              id="dev-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="dev@example.com"
              className="h-11 rounded-lg border border-line-strong bg-bg px-3 text-base text-ink"
            />
            <button
              type="submit"
              className="h-11 rounded-lg bg-accent text-base font-bold text-on-accent"
            >
              Dev login
            </button>
          </form>
        )}
        <p className="mt-1 text-center text-xs leading-relaxed text-placeholder">
          การเข้าสู่ระบบถือว่ายอมรับ{" "}
          <a href="/privacy" className="text-accent underline">
            ข้อตกลงและนโยบายความเป็นส่วนตัว
          </a>
        </p>
      </div>
    </main>
  );
}
