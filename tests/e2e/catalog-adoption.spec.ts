import { expect, test, type Page, type Route } from "@playwright/test";
import { createHash } from "node:crypto";

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
const imageBody = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const webpBody = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function offlineManifest() {
  const asset = {
    asset_id: "offline-preview-7101",
    content_hash: createHash("sha256").update(webpBody).digest("hex"),
    storage_key: "blobs/offline-preview-7101.webp",
    width: 1,
    height: 1,
    byte_size: webpBody.byteLength,
  };
  const body = {
    schema_version: 1 as const, industry_id: 71, family_id: 171, family_slug: "offline-family",
    release_id: "11111111-1111-4111-8111-111111111111", release_version: 1, generated_at: now,
    product_count: 1, asset_count: 1, total_bytes: asset.byte_size,
    products: [{ ...catalog, preview: asset, detail: null }],
  };
  return { ...body, content_hash: createHash("sha256").update(canonical(body)).digest("hex") };
}

async function json(route: Route, body: unknown) {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
}

async function seed(
  page: Page,
  enabled: boolean,
  cursorV2 = enabled,
  referenceMedia = false,
  assetFails = false,
) {
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
  await page.route("http://localhost:8000/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/catalog-reference-assets/preview-7101") {
      if (route.request().headers().authorization !== "Bearer catalog-adoption-token") {
        return route.fulfill({ status: 401 });
      }
      if (assetFails) return route.fulfill({ status: 404 });
      return route.fulfill({ contentType: "image/png", body: imageBody });
    }
    if (path === "/legacy-catalog.png") {
      return route.fulfill({ contentType: "image/png", body: imageBody });
    }
    if (path === "/api/auth/me") return json(route, user);
    if (path === "/api/plans/current") return json(route, {
      user_id: user.id, store_id: user.store_id, plan: "pro", label: "Pro", status: "active",
      account_status: "active", started_at: now, expires_at: "2099-01-01T00:00:00.000Z",
      server_time: now, synced_at: now,
      capabilities: { "inventory.read": true, "inventory.write": true, sync: true },
      limits: { inventory_items: null }, tools: { catalog: true },
    });
    if (path === "/api/catalog-products/adoption-status") return json(route, {
      enabled, cursor_read_v2_enabled: cursorV2, reference_media_v1_enabled: referenceMedia,
    });
    const catalogResponse = {
      ...catalog,
      image_url: "/legacy-catalog.png",
      reference_preview_url: referenceMedia ? "/api/catalog-reference-assets/preview-7101" : null,
      reference_detail_url: null,
    };
    if (path === "/api/catalog-products/7101") return json(route, catalogResponse);
    if (path === "/api/catalog-products") return json(route, [catalogResponse]);
    if (path === "/api/catalog-products/page") return json(route, { items: [catalogResponse], next_cursor: null, has_more: false });
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

async function seedOfflineFamily(page: Page) {
  const manifest = offlineManifest();
  let assetRequests = 0;
  await page.addInitScript(({ seededUser, captured }) => {
    localStorage.setItem("access_token", JSON.stringify("catalog-adoption-token"));
    localStorage.setItem("inventory-last-user", JSON.stringify(seededUser));
    localStorage.setItem(`inventory-entitlement-v2:${seededUser.id}:${seededUser.store_id}`, JSON.stringify({
      user_id: seededUser.id, store_id: seededUser.store_id, plan: "pro", label: "Pro", status: "active",
      account_status: "active", started_at: captured, expires_at: "2099-01-01T00:00:00.000Z",
      server_time: captured, synced_at: captured, verified_at: captured, captured_at_ms: Date.now(), last_observed_at_ms: Date.now(),
      capabilities: { "inventory.read": true, "inventory.write": true, sync: true }, limits: { inventory_items: null }, tools: { catalog: true },
    }));
  }, { seededUser: user, captured: now });
  await page.route("http://localhost:8000/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/me") return json(route, user);
    if (path === "/api/plans/current") return json(route, {
      user_id: user.id, store_id: user.store_id, plan: "pro", label: "Pro", status: "active", account_status: "active",
      started_at: now, expires_at: "2099-01-01T00:00:00.000Z", server_time: now, synced_at: now,
      capabilities: { "inventory.read": true, "inventory.write": true, sync: true }, limits: { inventory_items: null }, tools: { catalog: true },
    });
    if (path === "/api/catalog-products/adoption-status") return json(route, {
      enabled: true, cursor_read_v2_enabled: true, reference_media_v1_enabled: true, offline_families_v1_enabled: true,
    });
    if (path === "/api/catalog-reference/families") return json(route, [{ id: 171, industry_id: 71, slug: "offline-family", name: "خانواده آفلاین", is_active: true, sort_order: 1 }]);
    if (path === "/api/catalog-reference/releases/current") return json(route, {
      id: manifest.release_id, industry_id: 71, version: 1, status: "published", manifest_hash: "a".repeat(64), published_at: now,
    });
    if (path === `/api/catalog-reference/releases/${manifest.release_id}/manifest`) return json(route, manifest);
    if (path === "/api/catalog-reference-assets/offline-preview-7101") {
      assetRequests += 1;
      expect(route.request().headers().authorization).toBe("Bearer catalog-adoption-token");
      expect(url.searchParams.get("release_id")).toBe(manifest.release_id);
      expect(url.searchParams.get("family_slug")).toBe("offline-family");
      return route.fulfill({ contentType: "image/webp", body: webpBody });
    }
    if (path === "/api/catalog-products/page") return json(route, { items: [{
      ...catalog,
      reference_preview_url: "/api/catalog-reference-assets/offline-preview-7101",
      reference_detail_url: null,
      reference_preview: manifest.products[0].preview,
      reference_detail: null,
      reference_family_slug: "offline-family",
    }], next_cursor: null, has_more: false });
    if (path === "/api/catalog-products/7101") return json(route, catalog);
    if (path === "/api/categories" || path === "/api/labels") return json(route, []);
    if (path === "/api/sync/changes") return json(route, { cursor: 0, changes: [] });
    if (path === "/api/sync/categories" || path === "/api/sync/barcodes") return json(route, { items: [] });
    return route.abort();
  });
  return { assetRequests: () => assetRequests };
}

test("flag on browses without writes and explicitly adopts through the local-first inventory workflow", async ({ page }) => {
  await seed(page, true);
  await page.goto("/tools/catalog");
  await expect(page.getByText("چای مرجع")).toBeVisible();
  expect(await localCatalogRows(page)).toEqual([]);

  await page.locator('a[href*="catalogId=7101"]').click();
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

test("cursor flag off rolls back to the Gate 1 catalog reader", async ({ page }) => {
  await seed(page, true, false);
  await page.goto("/tools/catalog");
  await expect(page.getByText("چای مرجع")).toBeVisible();
  await expect(page.locator('a[href*="catalogId=7101"]')).toBeVisible();
  expect(await localCatalogRows(page)).toEqual([]);
});

test("reference preview is preferred when Gate 3 is enabled", async ({ page }) => {
  await seed(page, true, true, true);
  await page.goto("/tools/catalog");
  const image = page.getByRole("img", { name: catalog.name });
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
});

test("a failed reference preview falls back to the legacy image", async ({ page }) => {
  await seed(page, true, true, true, true);
  await page.goto("/tools/catalog");
  const image = page.getByRole("img", { name: catalog.name });
  await expect(image).toHaveAttribute("src", "http://localhost:8000/legacy-catalog.png");
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
});

test("Gate 3 flag off preserves the legacy image path", async ({ page }) => {
  await seed(page, true, true, false);
  await page.goto("/tools/catalog");
  await expect(page.getByRole("img", { name: catalog.name }))
    .toHaveAttribute("src", "http://localhost:8000/legacy-catalog.png");
});

test("downloads a verified family and reopens its metadata and image offline", async ({ page, context }) => {
  await seedOfflineFamily(page);
  await page.goto("/setting/catalog-images");
  await expect(page.getByText("خانواده آفلاین")).toBeVisible();
  await page.getByRole("button", { name: "دانلود سبک" }).click();
  await expect(page.getByText("کامل", { exact: true }).last()).toBeVisible({ timeout: 15_000 });

  await page.goto("/tools/catalog");
  await expect(page.getByText(catalog.name)).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  }
  // Playwright route fulfillment bypasses the browser's offline signal. Force
  // the next document's capability signal as well as blocking real network.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false }));
  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.getByRole("heading", { name: "کاتالوگ آفلاین" })).toBeVisible();
  await expect(page.getByText(catalog.name)).toBeVisible();
  const image = page.getByRole("img", { name: catalog.name });
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
});

test("automatically caches a published visible reference without a repeat transfer", async ({ page }) => {
  const tracker = await seedOfflineFamily(page);
  await page.goto("/tools/catalog");
  const image = page.getByRole("img", { name: catalog.name });
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect.poll(tracker.assetRequests).toBe(1);
  await page.reload();
  await expect(page.getByRole("img", { name: catalog.name })).toHaveAttribute("src", /^blob:/);
  await expect.poll(tracker.assetRequests).toBe(1);
});
