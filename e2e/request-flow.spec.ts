import { test, expect } from "@playwright/test";

test("customer request reaches musician and shows seen", async ({ browser, page }) => {
  // Musician: dev login -> setup
  await page.goto("/login");
  await page.locator("#dev-email").fill("band@example.com");
  await page.getByRole("button", { name: "Dev login" }).click();
  await page.waitForURL("**/setup");

  await page.getByLabel("ชื่อวงหรือชื่อศิลปิน").fill("วงทดสอบ");
  await page.getByRole("button", { name: "เบอร์มือถือ" }).click();
  await page.locator("#promptpayId").fill("0812345678");
  await page.getByRole("button", { name: /ถัดไป: ใส่เพลงที่เล่นได้/ }).click();
  await page.waitForURL("**/dashboard/songs");

  // Add a custom song
  await page.getByRole("button", { name: "ไม่เจอเพลงที่หา? เพิ่มเอง" }).click();
  await page.getByLabel("ชื่อเพลง").fill("เพลงทดสอบ");
  await page.getByLabel("ศิลปิน").fill("ศิลปินทดสอบ");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByText("เพลงทดสอบ").first()).toBeVisible();

  // Public link of the default setlist
  await page.goto("/dashboard/setlists");
  const publicUrl = await page.getByTestId("setlist-url").first().inputValue();
  expect(publicUrl).toMatch(/^http:\/\/localhost:3200\/r\/[^/]+$/);

  // Customer on a phone-sized context
  const customerCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "th-TH",
  });
  const customer = await customerCtx.newPage();
  await customer.goto(publicUrl);
  await customer.getByRole("button", { name: /เพลงทดสอบ/ }).click();
  await customer.getByRole("button", { name: "ถัดไป" }).click();
  await customer.getByLabel(/ชื่อหรือเลขโต๊ะ/).fill("โต๊ะ 1");
  await expect(customer.getByRole("button", { name: "ไม่ให้ทิป", exact: true })).toHaveAttribute("aria-pressed", "true");
  await customer.getByRole("button", { name: /ส่งคำขอ/ }).click();
  await customer.waitForURL("**/status");
  await expect(customer.getByText("ส่งแล้ว").first()).toBeVisible();

  // Musician sees it on the live monitor, which posts "seen"
  await page.goto("/dashboard/requests");
  await expect(page.getByText("เพลงทดสอบ").first()).toBeVisible();
  await expect(page.getByText("โต๊ะ 1").first()).toBeVisible();

  await expect(customer.getByText("นักดนตรีเห็นแล้ว")).toBeVisible({ timeout: 20_000 });
  await customerCtx.close();
});
