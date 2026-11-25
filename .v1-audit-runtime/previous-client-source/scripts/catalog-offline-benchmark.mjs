import { chromium, devices } from "@playwright/test";

const target = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const profiles = [
  ["desktop-chromium", devices["Desktop Chrome"]],
  ["mobile-emulation-pixel-7", devices["Pixel 7"]],
];
const output = {};

for (const [label, device] of profiles) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  await page.goto(target);
  output[label] = await page.evaluate(async () => {
    const sizes = [100, 1_000, 5_000, 10_000, 50_000];
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(`catalog-benchmark-${crypto.randomUUID()}`, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("products", { keyPath: "key" });
        store.createIndex("scopeFamilyRelease", ["scopeKey", "familyId", "releaseId"]);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transactionDone = (transaction) => new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const rows = [];
    for (const count of sizes) {
      const products = Array.from({ length: count }, (_, index) => ({
        key: `scope:product:release:1:${index + 1}`,
        scopeKey: "scope",
        familyId: 1,
        releaseId: "release",
        id: index + 1,
        name: index % 97 === 0 ? `needle product ${index}` : `product ${index}`,
        normalizedName: index % 97 === 0 ? `needle product ${index}` : `product ${index}`,
        brand: "benchmark",
        description: "bounded metadata record",
      }));
      const json = JSON.stringify(products);
      const parseStarted = performance.now();
      JSON.parse(json);
      const parseMs = performance.now() - parseStarted;
      const writeStarted = performance.now();
      const transaction = db.transaction("products", "readwrite");
      transaction.objectStore("products").clear();
      for (const product of products) transaction.objectStore("products").put(product);
      await transactionDone(transaction);
      const writeMs = performance.now() - writeStarted;
      const searchStarted = performance.now();
      const hits = await new Promise((resolve, reject) => {
        const found = [];
        const searchTransaction = db.transaction("products", "readonly");
        const request = searchTransaction.objectStore("products").index("scopeFamilyRelease")
          .openCursor(IDBKeyRange.only(["scope", 1, "release"]));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || found.length === 24) return resolve(found);
          if (cursor.value.normalizedName.includes("needle")) found.push(cursor.value.id);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
      });
      rows.push({
        products: count,
        manifestBytes: new TextEncoder().encode(json).byteLength,
        parseMs: Number(parseMs.toFixed(2)),
        indexedDbWriteMs: Number(writeMs.toFixed(2)),
        first24SearchMs: Number((performance.now() - searchStarted).toFixed(2)),
        hits: hits.length,
      });
    }
    let opfs = { available: false };
    if (navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("catalog-benchmark", { create: true });
      const handle = await dir.getFileHandle("one-megabyte.bin", { create: true });
      const bytes = new Uint8Array(1024 * 1024);
      const writeStarted = performance.now();
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      const writeMs = performance.now() - writeStarted;
      const readStarted = performance.now();
      await (await handle.getFile()).arrayBuffer();
      opfs = { available: true, bytes: bytes.byteLength, writeMs: Number(writeMs.toFixed(2)), readMs: Number((performance.now() - readStarted).toFixed(2)) };
      await dir.removeEntry("one-megabyte.bin");
    }
    db.close();
    return { rows, opfs, jsHeapBytes: performance.memory?.usedJSHeapSize ?? null };
  });
  await context.close();
}

await browser.close();
console.log(JSON.stringify({ target, measuredAt: new Date().toISOString(), profiles: output }, null, 2));
