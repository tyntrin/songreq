import { test, expect } from "@playwright/test";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SONG = "เพลงทดสอบ";
const ARTIST = "ศิลปินทดสอบ";

test("customer request reaches the already-open monitor live and shows seen", async ({ browser, page, baseURL }) => {
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
  await page.getByLabel("ชื่อเพลง").fill(SONG);
  await page.getByLabel("ศิลปิน").fill(ARTIST);
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByText(SONG, { exact: true })).toBeVisible();

  // Public link of the (only) setlist
  await page.goto("/dashboard/setlists");
  const urlField = page.getByTestId("setlist-url");
  await expect(urlField).toHaveCount(1);
  const publicUrl = await urlField.inputValue();
  expect(publicUrl).toMatch(new RegExp(`^${escapeRegExp(baseURL!)}/r/[a-z0-9]+$`));

  // Musician opens the live monitor BEFORE any request exists
  await page.goto("/dashboard/requests");
  await expect(page.getByText("ยังไม่มีคำขอคืนนี้", { exact: true })).toBeVisible();
  // marker survives only if the page is never reloaded or navigated
  await page.evaluate(() => {
    (window as unknown as { __noReload?: boolean }).__noReload = true;
  });

  // Customer on a phone-sized context
  const customerCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "th-TH",
  });
  const customer = await customerCtx.newPage();
  await customer.goto(publicUrl);
  await customer.getByRole("button", { name: `เลือก: ${SONG}`, exact: true }).click();
  await customer.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await customer.getByLabel("ชื่อหรือเลขโต๊ะ", { exact: false }).fill("โต๊ะ 1");
  await expect(customer.getByRole("button", { name: "ไม่ให้ทิป", exact: true })).toHaveAttribute("aria-pressed", "true");
  await customer.getByRole("button", { name: "ส่งคำขอ (ไม่ให้ทิป)", exact: true }).click();
  await customer.waitForURL("**/status");
  const statusRow = customer.getByRole("listitem").filter({ has: customer.getByText(SONG, { exact: true }) });
  await expect(statusRow).toHaveCount(1);

  // The card arrives on the open monitor via SSE: no navigation, no reload
  const card = page.getByRole("article").filter({ has: page.getByText(SONG, { exact: true }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByText(ARTIST, { exact: true })).toBeVisible();
  await expect(card.getByText("โต๊ะ 1", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  expect(new URL(page.url()).pathname).toBe("/dashboard/requests");

  // The visible monitor marks it seen; the customer's status updates live
  await expect(statusRow.getByText("นักดนตรีเห็นแล้ว", { exact: true })).toBeVisible({ timeout: 20_000 });
  await customerCtx.close();
});
