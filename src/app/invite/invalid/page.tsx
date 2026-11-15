import Link from "next/link";

export default function InviteInvalidPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-lg font-semibold">ลิงก์เชิญหมดอายุหรือถูกใช้แล้ว</p>
      <Link
        href="/"
        className="flex h-11 items-center rounded-full border border-line-strong bg-surface px-5 text-[15px] font-semibold"
      >
        กลับหน้าแรก
      </Link>
    </main>
  );
}
