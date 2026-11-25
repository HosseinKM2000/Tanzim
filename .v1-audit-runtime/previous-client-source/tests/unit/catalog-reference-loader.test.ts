import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  pending: new Map<string, (blob: Blob) => void>(),
}));

vi.mock("@/shared/lib/infrastructure/sync/sync-status", () => ({
  syncStatusStore: { get: () => ({ state: "idle" }), subscribe: () => () => undefined },
}));
vi.mock("@/features/catalog-offline/catalog-offline.api", () => ({
  getPublishedReferenceAsset: vi.fn((asset: { asset_id: string }) => {
    state.calls.push(asset.asset_id);
    return new Promise<Blob>((resolve) => state.pending.set(asset.asset_id, resolve));
  }),
}));
vi.mock("@/features/catalog-offline/catalog-offline.repository", () => ({
  catalogOfflineRepository: {
    asset: vi.fn().mockResolvedValue(undefined),
    markAssetAccessed: vi.fn(),
    upsertVerifiedAsset: vi.fn(),
  },
}));
vi.mock("@/features/catalog-offline/reference-image.repository", () => ({
  referenceImageRepository: {
    verifyDownload: vi.fn(),
    save: vi.fn().mockResolvedValue("catalog-reference://asset"),
    read: vi.fn().mockImplementation(() => Promise.resolve(new File(["ok"], "asset.webp", { type: "image/webp" }))),
  },
}));

import { CatalogReferenceLoader } from "@/features/catalog-offline/catalog-reference-loader";
import type { CatalogManifestAsset, CatalogOfflineScope } from "@/features/catalog-offline/types";

const scope: CatalogOfflineScope = { ownerUserId: 1, storeId: 2, industryId: 3, scopeKey: "1:2:3" };
function asset(id: string): CatalogManifestAsset {
  return { asset_id: id, content_hash: id.padEnd(64, "0"), storage_key: `${id}.webp`, width: 10, height: 10, byte_size: 2 };
}
function request(item: CatalogManifestAsset, priority: "visible" | "bulk", signal?: AbortSignal) {
  return { scope, asset: item, variant: "preview" as const, releaseId: "release", familySlug: "family", priority, signal };
}
async function turn() { await Promise.resolve(); await Promise.resolve(); }

beforeEach(() => {
  state.calls.length = 0;
  state.pending.clear();
});

describe("catalog reference loader", () => {
  it("deduplicates consumers and does not let one cancellation abort the shared transfer", async () => {
    const loader = new CatalogReferenceLoader(2, 1);
    const item = asset("a");
    const controller = new AbortController();
    const cancelled = loader.load(request(item, "visible", controller.signal));
    const retained = loader.load(request(item, "visible"));
    await turn();
    expect(state.calls).toEqual(["a"]);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    state.pending.get("a")!(new Blob(["ok"], { type: "image/webp" }));
    await expect(retained).resolves.toBeInstanceOf(File);
  });

  it("starts a visible request before queued bulk work", async () => {
    const loader = new CatalogReferenceLoader(1, 1);
    const first = loader.load(request(asset("a"), "bulk"));
    const second = loader.load(request(asset("b"), "bulk"));
    const visible = loader.load(request(asset("c"), "visible"));
    await turn();
    expect(state.calls).toEqual(["a"]);
    state.pending.get("a")!(new Blob(["ok"]));
    await first;
    await turn();
    expect(state.calls).toEqual(["a", "c"]);
    state.pending.get("c")!(new Blob(["ok"]));
    await visible;
    await turn();
    expect(state.calls).toEqual(["a", "c", "b"]);
    state.pending.get("b")!(new Blob(["ok"]));
    await second;
  });
});
