import { expect, test, type Page, type Route } from "@playwright/test";

const now = "2026-11-18T00:00:00.000Z";
const user = {
  id: 7701, first_name: "Catalog", last_name: "Owner", username: "catalog-owner",
  email: null, phone: "09120007701", industry_id: 71, plan: "pro", is_active: true,
  is_admin: false, role: "USER", is_system_admin: false, is_store_owner: true,
  store_id: 8701, membership_id: 9701, store_operating_mode: "solo", store_policy_version: 1,
  subscription_started_at: now, subscription_expires_at: "2099-01-01T00:00:00.000Z", created_at: now,
};
const catalog = {
  id: 7101, industry_id: 71, is_active: true, name: "چای مرجع",
  description: "محصول مشترک کاتالوگ", brand: "تنظیم", image_url: null,
  is_packaged: false, pack_size: null, created_at: now,
};

async function json(route: Route, body: unknown) {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
}

async function seed(page: Page, enabled: boolean) {
  await page.addInitScript(({ seededUser, captured }) => {
    localStorage.setItem("access_token", JSON.stringify("catalog-adoption-token"));
    localStorage.setItem("inventory-last-user", JSON.stringify(seededUser));
    localStorage.setItem(`inventory-entitlement-v2:${seededUser.id}:${seededUser.store_id}`, JSON.stringify({
      user_id: seededUser.id, store_id: seededUser.store_id, plan: "pro", label: "Pro",
      status: "active", account_status: "active", started_at: captured,
      expires_at: "2099-01-01T00:00:00.000Z", server_time: captured, synced_at: captured,
      verified_at: captured, captured_at_ms: Date.now(), last_observed_at_ms: Date.now(),
      capabilities: { "inventory.read": true, "inventory.write": true, sync: true },
      limits: { inventory_items: null }, tools: { catalog: true },
    }));
  }, { seededUser: user, captured: now });
  await page.route("http://localhost:8000/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return json(route, user);
    if (path === "/api/plans/current") return json(route, {
      user_id: user.id, store_id: user.store_id, plan: "pro", label: "Pro", status: "active",
      account_status: "active", started_at: now, expires_at: "2099-01-01T00:00:00.000Z",
      server_time: now, synced_at: now,
      capabilities: { "inventory.read": true, "inventory.write": true, sync: true },
      limits: { inventory_items: null }, tools: { catalog: true },
    });
    if (path === "/api/catalog-products/adoption-status") return json(route, { enabled });
    if (path === "/api/catalog-products/7101") return json(route, catalog);
    if (path === "/api/catalog-products") return json(route, [catalog]);
    if (path === "/api/categories" || path === "/api/labels") return json(route, []);
    if (path === "/api/sync/changes") return json(route, { cursor: 0, changes: [] });
    if (path === "/api/sync/categories" || path === "/api/sync/barcodes") return json(route, { items: [] });
    return route.abort();
  });
}

async function localCatalogRows(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("inventory-db");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<Array<{ id: number; catalog_product_id: number }>>((resolve, reject) => {
      const request = database.transaction("inventoryItems").objectStore("inventoryItems").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

test("flag on browses without writes and explicitly adopts through the local-first inventory workflow", async ({ page }) => {
  await seed(page, true);
  await page.goto("/tools/catalog");
  await expect(page.getByText("چای مرجع")).toBeVisible();
  expect(await localCatalogRows(page)).toEqual([]);

  await page.getByRole("link", { name: "افزودن به موجودی" }).click();
  await expect(page).toHaveURL(/catalogId=7101/);
  await expect(page.locator('input[value="چای مرجع"]')).toBeVisible();
  await page.locator('input[name="quantity"]').fill("4");
  await page.locator('input[name="sale_price"]').fill("250");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/inventory\/list/);
  await expect(page.getByText("چای مرجع").first()).toBeVisible();
  const rows = await localCatalogRows(page);
  expect(rows).toHaveLength(1);
  expect(rows[0].catalog_product_id).toBe(7101);
});

test("flag off preserves the legacy catalog preferences surface", async ({ page }) => {
  await seed(page, false);
  await page.goto("/tools/catalog");
  await expect(page.getByRole("switch", { name: "نمایش محصولات کاتالوگی" })).toBeVisible();
  await expect(page.getByRole("link", { name: "افزودن به موجودی" })).toHaveCount(0);
});
