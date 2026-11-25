import { expect, test, type Page, type Route } from "@playwright/test";

const now = "2026-11-16T16:00:00.000Z";
const owner = {
  id: 8801, first_name: "مالک", last_name: "طبقه‌بندی", username: "scb-owner",
  email: null, phone: "09120008801", industry_id: null, plan: "pro", is_active: true,
  is_admin: false, role: "USER", is_system_admin: false, is_store_owner: true,
  store_id: 9801, membership_id: 10801, store_operating_mode: "solo", store_policy_version: 1,
  subscription_started_at: now, subscription_expires_at: "2099-01-01T00:00:00.000Z", created_at: now,
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seed(page: Page, {
  industryId = null,
  recategorization = false,
  scannerSnapshot = false,
}: { industryId?: number | null; recategorization?: boolean; scannerSnapshot?: boolean } = {}) {
  const activeOwner = { ...owner, industry_id: industryId };
  let confirmedRecategorization = false;
  let confirmationCalls = 0;
  const categories = [
    {
      id: 1, name: "تعلیق و فرمان", description: "سیبک، طبق، میل موج‌گیر", code: "08", sector_code: "01",
      origin: "system", approval_status: "approved", is_active: true, reference_key: "sector-01-category-08",
      taxonomy_version: "scb-2026-11-14-v1", version: 1, created_at: now, updated_at: now,
    },
    {
      id: 2, name: "روغن و روانکار", description: "روغن موتور", code: "09", sector_code: "01",
      origin: "system", approval_status: "approved", is_active: true, reference_key: "sector-01-category-09",
      taxonomy_version: "scb-2026-11-14-v1", version: 1, created_at: now, updated_at: now,
    },
  ];
  const product = {
    id: 501, catalog_product_id: 701, is_catalog_backed: false,
    category_id: confirmedRecategorization ? 2 : 1, label_ids: [], version: confirmedRecategorization ? 2 : 1,
    quantity: 5, price: 900, sale_price: 900, purchase_price: 600, price_missing: false,
    custom_label: "قطعه آزمایشی", note: null, low_stock_threshold: 1, low_stock_alert: true,
    is_hidden: false, image_url: null, deleted_at: null, status: "in_stock", created_at: now, updated_at: now,
    catalog_product: { id: 701, industry_id: 1, name: "قطعه آزمایشی", description: null, brand: null, image_url: null, is_packaged: false, pack_size: null, created_at: now },
  };
  await page.addInitScript(({ user, captured }) => {
    localStorage.setItem("access_token", JSON.stringify("scb-rollout-token"));
    localStorage.setItem("inventory-last-user", JSON.stringify(user));
    localStorage.setItem("inventory-appearance", "dark");
    localStorage.setItem("inventory-display-size", "large");
    localStorage.setItem(`inventory-entitlement-v2:${user.id}:${user.store_id}`, JSON.stringify({
      user_id: user.id, store_id: user.store_id, plan: "pro", label: "SCB synthetic",
      status: "active", account_status: "active", started_at: captured, expires_at: "2099-01-01T00:00:00.000Z",
      server_time: captured, synced_at: captured, verified_at: captured,
      captured_at_ms: Date.now(), last_observed_at_ms: Date.now(),
      capabilities: { "inventory.read": true, "inventory.write": true, "barcode.lookup": true, "sync": true, "categories.write": true },
      limits: { inventory_items: null }, tools: { categories: true },
    }));
  }, { user: activeOwner, captured: now });
  await page.route("http://localhost:8000/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return json(route, activeOwner);
    if (path === "/api/plans/current") return json(route, {
      user_id: activeOwner.id, store_id: activeOwner.store_id, plan: "pro", label: "SCB synthetic",
      status: "active", account_status: "active", started_at: now, expires_at: "2099-01-01T00:00:00.000Z",
      server_time: now, synced_at: now,
      capabilities: { "inventory.read": true, "inventory.write": true, "barcode.lookup": true, "sync": true, "categories.write": true },
      limits: { inventory_items: null }, tools: { categories: true },
    });
    if (path === "/api/taxonomy/sectors") return json(route, [{
      id: 1, reference_key: "sector-01", code: "01", name_fa: "خودرو و قطعات",
      taxonomy_version: "scb-2026-11-14-v1", custom_categories_allowed: true,
    }]);
    if (path === "/api/taxonomy/state") return json(route, {
      taxonomy_version: recategorization ? "scb-2026-11-14-v1" : null,
      taxonomy_policy_version: recategorization ? 1 : 0,
      sector_code: recategorization ? "01" : null,
      adopted_at: recategorization ? now : null,
      has_historical_inventory_usage: recategorization,
      adoption_enabled: false,
    });
    if (path === "/api/taxonomy/recategorization/preview") return json(route, {
      store_id: activeOwner.store_id, destination_category_id: 2,
      targets: [{ product_id: 501, version: 1, current_category_id: 1, internal_labels_to_replace: 1 }],
      expires_at: "2099-01-01T00:00:00.000Z", confirmation_token: "synthetic-version-bound-token",
    });
    if (path === "/api/taxonomy/recategorization/confirm") {
      confirmationCalls += 1;
      confirmedRecategorization = true;
      return json(route, { status: "applied", operation_id: "synthetic-recategorization", replacements: [{ product_id: 501, barcode: "TZ1-01-09-0123456789ABCDEFGHJKMNPQ" }] });
    }
    if (path === "/api/sync/changes") return json(route, confirmedRecategorization ? {
      cursor: 1,
      changes: [{ cursor: 1, entity: "product", entity_id: 501, operation: "UPSERT", record: { ...product, category_id: 2, version: 2, updated_at: now } }],
    } : { cursor: 0, changes: [] });
    if (path === "/api/categories") return json(route, categories);
    if (path === "/api/labels") return json(route, []);
    if (path === "/api/sync/barcodes") return json(route, { items: confirmedRecategorization ? [
      {
        id: 801, store_id: activeOwner.store_id, product_id: 501, value: "TZ1-01-08-0123456789ABCDEFGHJKMNPQ",
        source: "tanzim", symbology: "datamatrix", meaning: "unit", scan_quantity: 1,
        is_active: false, is_default: false, lifecycle_status: "retired", version: 2,
        category_reference_key: "sector-01-category-08", created_at: now, updated_at: now,
      },
      {
        id: 802, store_id: activeOwner.store_id, product_id: 501, value: "TZ1-01-09-0123456789ABCDEFGHJKMNPQ",
        source: "tanzim", symbology: "datamatrix", meaning: "unit", scan_quantity: 1,
        is_active: true, is_default: true, lifecycle_status: "active", version: 1,
        category_reference_key: "sector-01-category-09", created_at: now, updated_at: now,
      },
      {
        id: 803, store_id: activeOwner.store_id, product_id: 501, value: "00123AbC",
        source: "manufacturer", symbology: "unknown", meaning: "unit", scan_quantity: 1,
        is_active: true, is_default: false, lifecycle_status: "active", version: 1,
        category_reference_key: null, created_at: now, updated_at: now,
      },
    ] : scannerSnapshot ? [
      {
        id: 801, store_id: activeOwner.store_id, product_id: 501, value: "TZ1-01-08-0123456789ABCDEFGHJKMNPQ",
        source: "tanzim", symbology: "datamatrix", meaning: "unit", scan_quantity: 1,
        is_active: false, is_default: false, lifecycle_status: "retired", version: 2,
        category_reference_key: "sector-01-category-08", created_at: now, updated_at: now,
      },
      {
        id: 803, store_id: activeOwner.store_id, product_id: 501, value: "00123AbC",
        source: "manufacturer", symbology: "unknown", meaning: "unit", scan_quantity: 1,
        is_active: true, is_default: true, lifecycle_status: "active", version: 1,
        category_reference_key: null, created_at: now, updated_at: now,
      },
    ] : [] });
    if (path === "/api/sync/categories") return json(route, { items: [] });
    return route.abort();
  });
  return { get confirmationCalls() { return confirmationCalls; } };
}

async function seedGuidanceCategories(page: Page) {
  await page.goto("/dashboard");
  await page.evaluate(async ({ user, captured }) => {
    const request = indexedDB.open("inventory-db");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("categories", "readwrite");
    const store = transaction.objectStore("categories");
    store.put({
      local_key: `${user.id}:${user.store_id}:1`, local_user_id: user.id, local_store_id: user.store_id,
      id: 1, name: "تعلیق و فرمان", description: "سیبک، طبق، میل موج‌گیر", code: "08", sector_code: "01",
      origin: "system", approval_status: "approved", is_active: true, reference_key: "sector-01-category-08",
      taxonomy_version: "scb-2026-11-14-v1", version: 1, created_at: captured, updated_at: captured,
    });
    store.put({
      local_key: `${user.id}:${user.store_id}:2`, local_user_id: user.id, local_store_id: user.store_id,
      id: 2, name: "روغن و روانکار", description: "روغن موتور", code: "09", sector_code: "01",
      origin: "system", approval_status: "approved", is_active: true, reference_key: "sector-01-category-09",
      taxonomy_version: "scb-2026-11-14-v1", version: 1, created_at: captured, updated_at: captured,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { user: owner, captured: now });
}

async function seedRecategorizedProduct(page: Page) {
  await page.goto("/dashboard");
  await page.evaluate(async ({ user, captured }) => {
    const request = indexedDB.open("inventory-db");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["inventoryItems", "barcodes", "categories", "syncMetadata"], "readwrite");
      transaction.objectStore("inventoryItems").put({
        local_key: `${user.id}:${user.store_id}:501`, local_user_id: user.id, local_store_id: user.store_id,
        id: 501, catalog_product_id: 701, is_catalog_backed: false, category_id: 1, label_ids: [], version: 1,
        quantity: 5, price: 900, sale_price: 900, purchase_price: 600, price_missing: false,
        custom_label: "قطعه آزمایشی", note: null, low_stock_threshold: 1, low_stock_alert: true,
        is_hidden: false, image_url: null, deleted_at: null, status: "in_stock", created_at: captured, updated_at: captured,
        catalog_product: { id: 701, industry_id: 1, name: "قطعه آزمایشی", description: null, brand: null, image_url: null, is_packaged: false, pack_size: null, created_at: captured },
      });
      transaction.objectStore("barcodes").put({
        local_key: `${user.id}:${user.store_id}:801`, local_user_id: user.id, local_store_id: user.store_id,
        id: 801, store_id: user.store_id, product_id: 501, value: "TZ1-01-08-0123456789ABCDEFGHJKMNPQ",
        source: "tanzim", symbology: "datamatrix", meaning: "unit", scan_quantity: 1,
        is_active: true, is_default: true, lifecycle_status: "active", version: 1,
        category_reference_key: "sector-01-category-08", created_at: captured, updated_at: captured,
      });
      for (const category of [
        { id: 1, name: "تعلیق و فرمان", description: "سیبک، طبق، میل موج‌گیر", code: "08", reference_key: "sector-01-category-08" },
        { id: 2, name: "روغن و روانکار", description: "روغن موتور", code: "09", reference_key: "sector-01-category-09" },
      ]) transaction.objectStore("categories").put({
        ...category, local_key: `${user.id}:${user.store_id}:${category.id}`, local_user_id: user.id, local_store_id: user.store_id,
        sector_code: "01", origin: "system", approval_status: "approved", is_active: true,
        taxonomy_version: "scb-2026-11-14-v1", version: 1, created_at: captured, updated_at: captured,
      });
      for (const [key, value] of [
        ["taxonomy-version", "scb-2026-11-14-v1"], ["taxonomy-sector-code", "01"],
        ["product-sync-initialized", 1], ["product-sync-cursor", 0],
      ]) transaction.objectStore("syncMetadata").put({ key: `${user.id}:${user.store_id}:${key}`, value, updatedAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { user: { id: owner.id, store_id: owner.store_id }, captured: now });
}

test("disabled adoption is explicit and cannot be submitted", async ({ page }) => {
  await seed(page);
  await page.goto("/industry");
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-display-size", "large");
  await expect(page.getByText(/ثبت حوزه‌های جدید تا تکمیل آزمون/)).toBeVisible();
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /01 — خودرو و قطعات/ }).click();
  await expect(page.getByRole("button", { name: "ذخیره و ادامه" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("category example search guides without classifying or creating records", async ({ page }) => {
  await seed(page, { industryId: 1 });
  await seedGuidanceCategories(page);
  await page.goto("/tools");
  await page.getByRole("link", { name: /^دسته‌ها/ }).click();
  const search = page.getByRole("textbox", { name: "جست‌وجوی راهنمای دسته‌بندی" });
  await expect(search).toBeVisible();
  await search.fill("سیبک");
  await expect(page.getByText("تعلیق و فرمان", { exact: true })).toBeVisible();
  await expect(page.getByText("روغن و روانکار", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/نمونه‌ها فقط برای یافتن دسته‌اند/)).toBeVisible();
  const count = await page.evaluate(async () => {
    const request = indexedDB.open("inventory-db");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise<number>((resolve, reject) => {
      const query = database.transaction("categories").objectStore("categories").count();
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    database.close();
    return result;
  });
  expect(count).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("recategorization cancel is inert and confirmation projects the atomic replacement", async ({ page }) => {
  const server = await seed(page, { industryId: 1, recategorization: true });
  await seedRecategorizedProduct(page);
  await page.goto("/inventory/edit?id=501");

  const categoryField = page.getByText("دسته‌بندی", { exact: true }).locator("..");
  await categoryField.getByRole("combobox").click();
  await page.getByRole("option", { name: "روغن و روانکار" }).click();
  await page.getByRole("button", { name: "ثبت تغییرات", exact: true }).click();

  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading", { name: "تغییر دسته و جایگزینی بارکد داخلی؟" })).toBeVisible();
  await expect(confirmation.getByText(/برچسب داخلی نیازمند چاپ مجدد: ۱/)).toBeVisible();
  await confirmation.getByRole("button", { name: "لغو و بازگشت به فرم" }).click();
  expect(server.confirmationCalls).toBe(0);
  expect(await page.evaluate(async () => {
    const request = indexedDB.open("inventory-db");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const item = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const query = database.transaction("inventoryItems").objectStore("inventoryItems").get("8801:9801:501");
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    database.close();
    return item.category_id;
  })).toBe(1);

  await page.getByRole("button", { name: "ثبت تغییرات", exact: true }).click();
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "تأیید تغییر دسته" }).click();
  await expect(page).toHaveURL(/\/inventory\/list/);
  expect(server.confirmationCalls).toBe(1);

  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open("inventory-db");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(["inventoryItems", "barcodes"]);
    const product = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const query = transaction.objectStore("inventoryItems").get("8801:9801:501");
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    const barcodes = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const query = transaction.objectStore("barcodes").getAll();
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    database.close();
    return JSON.stringify({
      category: product.category_id,
      lifecycle: barcodes.map((barcode) => [barcode.value, barcode.lifecycle_status, barcode.is_active]).sort(),
    });
  })).toBe(JSON.stringify({
    category: 2,
    lifecycle: [
      ["00123AbC", "active", true],
      ["TZ1-01-08-0123456789ABCDEFGHJKMNPQ", "retired", false],
      ["TZ1-01-09-0123456789ABCDEFGHJKMNPQ", "active", true],
    ],
  }));

});

test("scanner preserves a leading zero and blocks a retired code with guidance", async ({ page }) => {
  await seed(page, { industryId: 1, recategorization: true, scannerSnapshot: true });
  await seedRecategorizedProduct(page);
  await page.evaluate(async ({ user, captured }) => {
    const request = indexedDB.open("inventory-db");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("barcodes", "readwrite");
      const store = transaction.objectStore("barcodes");
      store.put({
        local_key: `${user.id}:${user.store_id}:801`, local_user_id: user.id, local_store_id: user.store_id,
        id: 801, store_id: user.store_id, product_id: 501, value: "TZ1-01-08-0123456789ABCDEFGHJKMNPQ",
        source: "tanzim", symbology: "datamatrix", meaning: "unit", scan_quantity: 1,
        is_active: false, is_default: false, lifecycle_status: "retired", version: 2,
        category_reference_key: "sector-01-category-08", created_at: captured, updated_at: captured,
      });
      store.put({
        local_key: `${user.id}:${user.store_id}:803`, local_user_id: user.id, local_store_id: user.store_id,
        id: 803, store_id: user.store_id, product_id: 501, value: "00123AbC",
        source: "manufacturer", symbology: "unknown", meaning: "unit", scan_quantity: 1,
        is_active: true, is_default: true, lifecycle_status: "active", version: 1,
        category_reference_key: null, created_at: captured, updated_at: captured,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { user: { id: owner.id, store_id: owner.store_id }, captured: now });

  const entitlementVerified = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/plans/current" && response.status() === 200,
  );
  await page.reload();
  await entitlementVerified;
  await page.goto("/tools");
  await page.getByRole("link", { name: /^اسکنر/ }).click();
  const barcodeInput = page.getByRole("textbox", { name: "بارکد" });
  await barcodeInput.fill("TZ1-01-08-0123456789ABCDEFGHJKMNPQ");
  await page.getByRole("button", { name: "بررسی" }).click();
  await expect(page.getByText("بارکد بازنشسته شده است", { exact: true })).toBeVisible();
  await expect(page.getByText(/برچسب جدید محصول را اسکن کنید/)).toBeVisible();

  await barcodeInput.fill("00123AbC");
  await page.getByRole("button", { name: "بررسی" }).click();
  await expect(page.getByText("قطعه آزمایشی", { exact: true })).toBeVisible();
  await expect(page.getByText("00123AbC", { exact: true })).toBeVisible();
});
