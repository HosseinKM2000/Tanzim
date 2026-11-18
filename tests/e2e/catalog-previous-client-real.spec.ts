import crypto from "node:crypto";

import { expect, test } from "@playwright/test";

const api = process.env.E2E_REAL_API_URL;
const industryId = Number(process.env.E2E_CATALOG_INDUSTRY_ID);
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

test.skip(
  !api || !Number.isSafeInteger(industryId) || industryId < 1 || !adminPassword,
  "A restored Gate 6 API, Catalog industry and isolated admin credential are required",
);

test("previous client reads the restored published Catalog and protected reference image", async ({ page, request }) => {
  const suffix = crypto.randomBytes(5).toString("hex");
  const adminDevice = `gate6-compat-admin-${suffix}`;
  const adminLogin = await request.post(`${api}/auth/login`, { data: {
    username: "HosseinKM2000",
    password: adminPassword,
    device_fingerprint: adminDevice,
  } });
  expect(adminLogin.ok()).toBeTruthy();
  const admin = await adminLogin.json();
  const adminHeaders = {
    Authorization: `Bearer ${admin.access_token}`,
    "X-Device-Fingerprint": adminDevice,
  };

  const device = `gate6-compat-owner-${suffix}`;
  const password = "StrongPass123!";
  const phoneSeed = BigInt(`0x${suffix}`) % 1_000_000_000n;
  const signup = await request.post(`${api}/auth/signup`, { data: {
    username: `gate6-compat-${suffix}`,
    password,
    device_fingerprint: device,
    phone: `09${phoneSeed.toString().padStart(9, "0")}`,
  } });
  expect(signup.status()).toBe(201);
  const session = await signup.json();
  const startedAt = new Date();
  const subscription = await request.patch(`${api}/admin/users/${session.user.id}/subscription`, {
    headers: adminHeaders,
    data: {
      plan: "personal",
      subscription_started_at: startedAt.toISOString(),
      subscription_expires_at: new Date(startedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  expect(subscription.ok()).toBeTruthy();
  const selected = await request.patch(`${api}/auth/industry`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "X-Device-Fingerprint": device,
      "X-Client-Data-Schema": "3",
    },
    data: { industry_id: industryId },
  });
  expect(selected.ok()).toBeTruthy();

  await page.goto("/auth/login");
  await page.locator('input[name="username"]').fill(`gate6-compat-${suffix}`);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(dashboard|inventory)/);
  await page.goto("/tools");
  await page.locator('a[href="/tools/catalog"]').click();
  await expect(page).toHaveURL(/\/tools\/catalog$/);
  await expect(page.getByText("Gate 6 product R2")).toBeVisible();
  const image = page.getByRole("img", { name: "Gate 6 product R2" });
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
});
