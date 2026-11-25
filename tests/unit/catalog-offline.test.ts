import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { catalogOfflineDb } from "@/features/catalog-offline/catalog-offline-db";
import { catalogManifestIntegrity, validateFamilyManifest } from "@/features/catalog-offline/catalog-offline.api";
import { catalogOfflineRepository, normalizeCatalogSearch } from "@/features/catalog-offline/catalog-offline.repository";
import { catalogDownloadService } from "@/features/catalog-offline/catalog-download.service";
import type { CatalogFamilyManifest, CatalogManifestAsset, CatalogOfflineScope } from "@/features/catalog-offline/types";

const scope: CatalogOfflineScope = { ownerUserId: 7, storeId: 11, industryId: 3, scopeKey: "7:11:3" };

function asset(id: string, hash: string): CatalogManifestAsset {
  return { asset_id: id, content_hash: hash.repeat(64).slice(0, 64), storage_key: `blobs/${id}.webp`, width: 320, height: 240, byte_size: 100 };
}

function manifest(releaseId: string, preview: CatalogManifestAsset): CatalogFamilyManifest {
  return {
    schema_version: 1,
    industry_id: 3,
    family_id: 5,
    family_slug: "starter",
    release_id: releaseId,
    release_version: 1,
    generated_at: "2026-11-18T00:00:00Z",
    product_count: 1,
    asset_count: 1,
    total_bytes: preview.byte_size,
    products: [{
      id: 41,
      industry_id: 3,
      name: "کالای ایرانی",
      brand: "نمونه",
      description: null,
      image_url: null,
      is_packaged: false,
      pack_size: null,
      created_at: "2026-11-18T00:00:00Z",
      preview,
      detail: null,
    }],
    content_hash: "f".repeat(64),
  };
}

beforeEach(async () => {
  await catalogOfflineDb.open();
  await catalogOfflineDb.transaction("rw", catalogOfflineDb.tables, async () => {
    await Promise.all(catalogOfflineDb.tables.map((table) => table.clear()));
  });
});

afterEach(() => catalogOfflineDb.close());

describe("offline catalog repository", () => {
  it("normalizes Arabic and Persian search forms consistently", () => {
    expect(normalizeCatalogSearch("  يى  كالا‌ ")).toBe("یی کالا");
  });

  it("activates a release atomically and preserves the prior release when verification fails", async () => {
    const firstAsset = asset("asset-1", "a");
    await catalogOfflineRepository.stageManifest(scope, { familyId: 5, slug: "starter", name: "شروع" }, manifest("release-1", firstAsset), false);
    await catalogOfflineRepository.upsertVerifiedAsset(scope, firstAsset, "preview", "catalog-reference://first");
    await catalogOfflineRepository.activateFamily(scope, 5, "release-1");

    const secondAsset = asset("asset-2", "b");
    await catalogOfflineRepository.stageManifest(scope, { familyId: 5, slug: "starter", name: "شروع" }, manifest("release-2", secondAsset), false);
    await expect(catalogOfflineRepository.activateFamily(scope, 5, "release-2")).rejects.toThrow("CATALOG_ASSET_NOT_VERIFIED");

    const family = (await catalogOfflineRepository.families(scope))[0];
    expect(family.activeReleaseId).toBe("release-1");
    expect((await catalogOfflineRepository.product(scope, 41))?.releaseId).toBe("release-1");
  });

  it("does not expose another account or store partition", async () => {
    const preview = asset("asset-1", "c");
    await catalogOfflineRepository.stageManifest(scope, { familyId: 5, slug: "starter", name: "شروع" }, manifest("release-1", preview), false);
    const other = { ...scope, ownerUserId: 8, scopeKey: "8:11:3" };
    expect(await catalogOfflineRepository.families(other)).toEqual([]);
  });

  it("rejects a family manifest whose sealed content was changed", async () => {
    const preview = asset("asset-1", "d");
    const unsigned = manifest("release-1", preview);
    const { content_hash: placeholderHash, ...payload } = unsigned;
    void placeholderHash;
    const sealedHash = await catalogManifestIntegrity.sha256(catalogManifestIntegrity.canonical(payload));
    const sealed = { ...payload, content_hash: sealedHash };
    await expect(validateFamilyManifest(sealed, { industryId: 3, releaseId: "release-1", familySlug: "starter" })).resolves.toBe(sealed);
    await expect(validateFamilyManifest({ ...sealed, product_count: 2 }, { industryId: 3, releaseId: "release-1", familySlug: "starter" })).rejects.toThrow("CATALOG_MANIFEST_HASH_INVALID");
  });

  it("persists pause and cancel state without discarding completed entries", async () => {
    const now = Date.now();
    await catalogOfflineRepository.putJob({
      id: "job-1", scopeKey: scope.scopeKey, ownerUserId: 7, storeId: 11, industryId: 3,
      familyId: 5, familySlug: "starter", familyName: "شروع", releaseId: "release-1", releaseVersion: 1,
      includeDetails: false, state: "downloading", totalEntries: 1, completedEntries: 1,
      totalBytes: 100, completedBytes: 100, retryCount: 0, autoResume: true, createdAt: now, updatedAt: now,
    }, [{
      key: "job-1:asset", jobId: "job-1", scopeKey: scope.scopeKey, assetId: "asset", contentHash: "e".repeat(64),
      storageKey: "asset.webp", variant: "preview", byteSize: 100, width: 10, height: 10,
      state: "verified", attempts: 1, nextAttemptAt: 0, updatedAt: now,
    }]);
    await catalogDownloadService.pause("job-1");
    expect(await catalogOfflineRepository.job("job-1")).toMatchObject({ state: "paused", completedEntries: 1, autoResume: false });
    expect(await catalogOfflineRepository.entries("job-1")).toMatchObject([{ state: "verified" }]);
    await catalogDownloadService.cancel("job-1");
    expect(await catalogOfflineRepository.job("job-1")).toMatchObject({ state: "cancelled", completedEntries: 1 });
  });
});
