import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test("public recovery and legal status journey is keyboard-accessible", async ({ page }) => {
  let submittedIdentifier = "";
  await page.route("**/api/auth/recovery/request", async (route) => {
    submittedIdentifier = (await route.request().postDataJSON()).identifier;
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ message: "PASSWORD_RECOVERY_REQUEST_ACCEPTED", delivery_available: false }),
    });
  });

  await page.goto("/auth/login");
  await page.getByRole("link", { name: "رمز عبور را فراموش کرده‌اید؟" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/auth\/recovery$/);
  await page.getByLabel("نام کاربری یا شماره موبایل").fill("unknown-account");
  await page.getByRole("button", { name: "ثبت درخواست بازیابی" }).click();
  await expect(page.getByRole("status")).toContainText("هیچ کد یا پیوندی صادر نشده است");
  expect(submittedIdentifier).toBe("unknown-account");

  await page.goto("/auth/register");
  await page.getByRole("link", { name: "وضعیت قوانین استفاده" }).click();
  await expect(page.getByRole("heading", { name: "وضعیت قوانین استفاده", level: 1 })).toBeVisible();
  await expect(page.getByText("متن الزام‌آور قوانین استفاده هنوز")).toBeVisible();
  await page.getByRole("link", { name: "وضعیت حریم خصوصی" }).click();
  await expect(page.getByRole("heading", { name: "وضعیت حریم خصوصی", level: 1 })).toBeVisible();
});

test.describe("authenticated browser journey", () => {
  test.skip(!username || !password, "E2E_USERNAME and E2E_PASSWORD must identify an isolated test user");

  test("login grants protected access and logout revokes it", async ({ page }) => {
    await page.goto("/auth/login");
    await page.locator('input[name="username"]').fill(username!);
    await page.locator('input[name="password"]').fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/(dashboard|industry|inventory)/);
    await expect(page.getByRole("main").first()).toBeVisible();

    await page.goto("/setting");
    await page.getByRole("button", { name: "خروج از حساب کاربری", exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await page.goto("/inventory/list");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
