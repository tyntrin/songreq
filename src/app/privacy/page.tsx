import Link from "next/link";

export const metadata = { title: "นโยบายความเป็นส่วนตัว" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-12 pt-8">
      <Link href="/" className="flex h-11 items-center gap-1.5 text-[15px] font-semibold text-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        กลับหน้าหลัก
      </Link>
      <h1 className="text-[26px] font-bold leading-tight">นโยบายความเป็นส่วนตัว</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-[17px] font-bold">ข้อมูลที่เราเก็บ</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-[#C9C0B5]">
          <li>ชื่อหรือชื่อโต๊ะที่ลูกค้าใส่ตอนขอเพลง (ไม่บังคับ)</li>
          <li>ข้อความที่ลูกค้าฝากถึงนักดนตรี (ไม่บังคับ)</li>
          <li>รหัสสุ่มของอุปกรณ์ ใช้กันการขอซ้ำและจำกัดจำนวนคำขอ ไม่ใช่ข้อมูลที่ระบุตัวตนได้</li>
          <li>ยอดทิปที่ลูกค้าแจ้งว่าโอนแล้ว เงินโอนเข้าบัญชีนักดนตรีโดยตรง แอพไม่ได้รับหรือเก็บเงิน</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[17px] font-bold">เก็บนานแค่ไหน</h2>
        <p className="text-[15px] leading-relaxed text-[#C9C0B5]">
          ชื่อและข้อความในคำขอจะถูกลบโดยอัตโนมัติเมื่อครบ 90 วัน
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[17px] font-bold">ติดต่อเรา</h2>
        <p className="text-[15px] leading-relaxed text-[#C9C0B5]">
          ต้องการให้ลบข้อมูลหรือมีคำถาม ติดต่อ [อีเมลติดต่อ]
        </p>
      </section>
    </main>
  );
}
