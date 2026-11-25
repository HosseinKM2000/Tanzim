import { catalogOfflineDb } from "./catalog-offline-db";
import { assetKey, familyKey, productKey } from "./scope";
import type {
  CatalogDownloadEntry,
  CatalogDownloadJob,
  CatalogFamilyManifest,
  CatalogManifestAsset,
  CatalogOfflineFamily,
  CatalogOfflineProduct,
  CatalogOfflineRelease,
  CatalogOfflineScope,
  CatalogReferenceAssetRecord,
} from "./types";

export function normalizeCatalogSearch(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0649\u064A]/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/[\u200c\s]+/g, " ")
    .trim()
    .toLocaleLowerCase("fa-IR");
}

function productRecord(
  scope: CatalogOfflineScope,
  manifest: CatalogFamilyManifest,
  product: CatalogFamilyManifest["products"][number],
): CatalogOfflineProduct {
  return {
    key: productKey(scope, manifest.release_id, manifest.family_id, product.id),
    scopeKey: scope.scopeKey,
    ownerUserId: scope.ownerUserId,
    storeId: scope.storeId,
    familyId: manifest.family_id,
    familySlug: manifest.family_slug,
    releaseId: manifest.release_id,
    id: product.id,
    industry_id: product.industry_id,
    is_active: true,
    name: product.name,
    description: product.description,
    brand: product.brand,
    image_url: product.image_url,
    reference_preview_url: product.preview
      ? `/api/catalog-reference-assets/${product.preview.asset_id}`
      : null,
    reference_detail_url: product.detail
      ? `/api/catalog-reference-assets/${product.detail.asset_id}`
      : null,
    is_packaged: product.is_packaged,
    pack_size: product.pack_size,
    created_at: product.created_at,
    normalizedName: normalizeCatalogSearch(`${product.name} ${product.brand ?? ""} ${product.description ?? ""}`),
    preview: product.preview,
    detail: product.detail,
  };
}

function uniqueAssets(products: CatalogOfflineProduct[], includeDetails: boolean) {
  const assets = new Map<string, CatalogManifestAsset>();
  for (const product of products) {
    if (product.preview) assets.set(product.preview.content_hash, product.preview);
    if (includeDetails && product.detail) assets.set(product.detail.content_hash, product.detail);
  }
  return assets;
}

export const catalogOfflineRepository = {
  async stageManifest(
    scope: CatalogOfflineScope,
    family: Pick<CatalogOfflineFamily, "familyId" | "slug" | "name">,
    manifest: CatalogFamilyManifest,
    includeDetails: boolean,
  ) {
    const products = manifest.products.map((product) => productRecord(scope, manifest, product));
    const assets = uniqueAssets(products, includeDetails);
    const current = await catalogOfflineDb.families.get(familyKey(scope, family.familyId));
    const now = Date.now();
    const record: CatalogOfflineFamily = {
      key: familyKey(scope, family.familyId),
      scopeKey: scope.scopeKey,
      ownerUserId: scope.ownerUserId,
      storeId: scope.storeId,
      industryId: scope.industryId,
      familyId: family.familyId,
      slug: family.slug,
      name: family.name,
      activeReleaseId: current?.activeReleaseId,
      activeIncludeDetails: current?.activeIncludeDetails,
      pendingReleaseId: manifest.release_id,
      includeDetails,
      state: "queued",
      productCount: products.length,
      requiredAssets: assets.size,
      verifiedAssets: 0,
      totalBytes: [...assets.values()].reduce((sum, asset) => sum + asset.byte_size, 0),
      verifiedBytes: 0,
      lastVerifiedAt: current?.lastVerifiedAt,
      updateAvailable: Boolean(current?.activeReleaseId && current.activeReleaseId !== manifest.release_id),
      updatedAt: now,
    };
    await catalogOfflineDb.transaction("rw", catalogOfflineDb.products, catalogOfflineDb.families, async () => {
      await catalogOfflineDb.products
        .where("[scopeKey+familyId+releaseId]")
        .equals([scope.scopeKey, family.familyId, manifest.release_id])
        .delete();
      await catalogOfflineDb.products.bulkPut(products);
      await catalogOfflineDb.families.put(record);
    });
    return { family: record, products, assets };
  },

  async upsertVerifiedAsset(
    scope: CatalogOfflineScope,
    asset: CatalogManifestAsset,
    variant: "preview" | "detail",
    localPath: string,
  ) {
    const key = assetKey(scope, asset.content_hash);
    const current = await catalogOfflineDb.assets.get(key);
    const now = Date.now();
    const record: CatalogReferenceAssetRecord = {
      key,
      scopeKey: scope.scopeKey,
      ownerUserId: scope.ownerUserId,
      storeId: scope.storeId,
      industryId: scope.industryId,
      assetId: asset.asset_id,
      contentHash: asset.content_hash,
      storageKey: asset.storage_key,
      variant,
      byteSize: asset.byte_size,
      width: asset.width,
      height: asset.height,
      mimeType: "image/webp",
      localPath,
      state: "verified",
      pinCount: current?.pinCount ?? 0,
      lastVerifiedAt: now,
      lastAccessAt: now,
    };
    await catalogOfflineDb.assets.put(record);
    return record;
  },

  async markAssetAccessed(scope: CatalogOfflineScope, contentHash: string) {
    await catalogOfflineDb.assets.update(assetKey(scope, contentHash), { lastAccessAt: Date.now() });
  },

  async asset(scope: CatalogOfflineScope, contentHash: string) {
    return catalogOfflineDb.assets.get(assetKey(scope, contentHash));
  },

  async activateFamily(scope: CatalogOfflineScope, familyId: number, releaseId: string) {
    const key = familyKey(scope, familyId);
    await catalogOfflineDb.transaction(
      "rw",
      catalogOfflineDb.families,
      catalogOfflineDb.products,
      catalogOfflineDb.assets,
      async () => {
        const family = await catalogOfflineDb.families.get(key);
        if (!family || family.pendingReleaseId !== releaseId) throw new Error("CATALOG_PENDING_RELEASE_MISMATCH");
        const pending = await catalogOfflineDb.products
          .where("[scopeKey+familyId+releaseId]")
          .equals([scope.scopeKey, familyId, releaseId])
          .toArray();
        const nextAssets = uniqueAssets(pending, family.includeDetails);
        for (const asset of nextAssets.values()) {
          const record = await catalogOfflineDb.assets.get(assetKey(scope, asset.content_hash));
          if (!record || record.state !== "verified") throw new Error("CATALOG_ASSET_NOT_VERIFIED");
        }
        const previous = family.activeReleaseId
          ? await catalogOfflineDb.products
            .where("[scopeKey+familyId+releaseId]")
            .equals([scope.scopeKey, familyId, family.activeReleaseId])
            .toArray()
          : [];
        const previousAssets = uniqueAssets(previous, family.activeIncludeDetails ?? family.includeDetails);
        for (const hash of previousAssets.keys()) {
          if (!nextAssets.has(hash)) {
            const record = await catalogOfflineDb.assets.get(assetKey(scope, hash));
            if (record) await catalogOfflineDb.assets.update(record.key, { pinCount: Math.max(0, record.pinCount - 1) });
          }
        }
        for (const hash of nextAssets.keys()) {
          if (!previousAssets.has(hash)) {
            const record = await catalogOfflineDb.assets.get(assetKey(scope, hash));
            if (!record) throw new Error("CATALOG_ASSET_NOT_VERIFIED");
            await catalogOfflineDb.assets.update(record.key, { pinCount: record.pinCount + 1 });
          }
        }
        await catalogOfflineDb.families.update(key, {
          activeReleaseId: releaseId,
          activeIncludeDetails: family.includeDetails,
          pendingReleaseId: undefined,
          state: "complete",
          verifiedAssets: nextAssets.size,
          verifiedBytes: [...nextAssets.values()].reduce((sum, asset) => sum + asset.byte_size, 0),
          lastVerifiedAt: Date.now(),
          updateAvailable: false,
          lastError: undefined,
          updatedAt: Date.now(),
        });
      },
    );
  },

  families(scope: CatalogOfflineScope) {
    return catalogOfflineDb.families.where("scopeKey").equals(scope.scopeKey).sortBy("updatedAt");
  },

  async updateFamily(scope: CatalogOfflineScope, familyId: number, patch: Partial<CatalogOfflineFamily>) {
    await catalogOfflineDb.families.update(familyKey(scope, familyId), { ...patch, updatedAt: Date.now() });
  },

  async products(
    scope: CatalogOfflineScope,
    familyId: number,
    releaseId: string,
    search: string,
    offset: number,
    limit: number,
  ) {
    const normalized = normalizeCatalogSearch(search);
    let collection = catalogOfflineDb.products
      .where("[scopeKey+familyId+releaseId]")
      .equals([scope.scopeKey, familyId, releaseId]);
    if (normalized) collection = collection.filter((product) => product.normalizedName.includes(normalized));
    return collection.offset(offset).limit(limit).toArray();
  },

  async product(scope: CatalogOfflineScope, productId: number) {
    const candidates = await catalogOfflineDb.products.where("[scopeKey+id]").equals([scope.scopeKey, productId]).toArray();
    const families = new Map((await this.families(scope)).map((family) => [family.familyId, family]));
    return candidates.find((product) => families.get(product.familyId)?.activeReleaseId === product.releaseId);
  },

  async putJob(job: CatalogDownloadJob, entries: CatalogDownloadEntry[]) {
    await catalogOfflineDb.transaction("rw", catalogOfflineDb.jobs, catalogOfflineDb.entries, async () => {
      await catalogOfflineDb.jobs.put(job);
      await catalogOfflineDb.entries.where("jobId").equals(job.id).delete();
      await catalogOfflineDb.entries.bulkPut(entries);
    });
  },

  jobs(scope: CatalogOfflineScope) {
    return catalogOfflineDb.jobs.where("scopeKey").equals(scope.scopeKey).reverse().sortBy("updatedAt");
  },

  job(jobId: string) {
    return catalogOfflineDb.jobs.get(jobId);
  },

  entries(jobId: string) {
    return catalogOfflineDb.entries.where("jobId").equals(jobId).toArray();
  },

  async updateJob(jobId: string, patch: Partial<CatalogDownloadJob>) {
    await catalogOfflineDb.jobs.update(jobId, { ...patch, updatedAt: Date.now() });
  },

  async updateEntry(key: string, patch: Partial<CatalogDownloadEntry>) {
    await catalogOfflineDb.entries.update(key, { ...patch, updatedAt: Date.now() });
  },

  async saveRelease(scope: CatalogOfflineScope, release: CatalogOfflineRelease) {
    if (release.scopeKey !== scope.scopeKey || release.industryId !== scope.industryId) {
      throw new Error("CATALOG_RELEASE_SCOPE_INVALID");
    }
    await catalogOfflineDb.releases.put(release);
  },

  async latestRelease(scope: CatalogOfflineScope) {
    const rows = await catalogOfflineDb.releases.where("scopeKey").equals(scope.scopeKey).toArray();
    return rows.sort((left, right) => right.checkedAt - left.checkedAt)[0];
  },

  async removeFamily(scope: CatalogOfflineScope, familyId: number) {
    const key = familyKey(scope, familyId);
    const removable: string[] = [];
    await catalogOfflineDb.transaction(
      "rw",
      catalogOfflineDb.families,
      catalogOfflineDb.products,
      catalogOfflineDb.assets,
      catalogOfflineDb.jobs,
      catalogOfflineDb.entries,
      async () => {
        const family = await catalogOfflineDb.families.get(key);
        if (!family) return;
        const products = family.activeReleaseId
          ? await catalogOfflineDb.products
            .where("[scopeKey+familyId+releaseId]")
            .equals([scope.scopeKey, familyId, family.activeReleaseId])
            .toArray()
          : [];
        for (const hash of uniqueAssets(products, family.activeIncludeDetails ?? family.includeDetails).keys()) {
          const asset = await catalogOfflineDb.assets.get(assetKey(scope, hash));
          if (!asset) continue;
          const pinCount = Math.max(0, asset.pinCount - 1);
          await catalogOfflineDb.assets.update(asset.key, { pinCount });
          if (pinCount === 0) removable.push(hash);
        }
        const jobs = await catalogOfflineDb.jobs.where("[scopeKey+familyId]").equals([scope.scopeKey, familyId]).toArray();
        if (jobs.length) await catalogOfflineDb.entries.where("jobId").anyOf(jobs.map((job) => job.id)).delete();
        await catalogOfflineDb.jobs.where("[scopeKey+familyId]").equals([scope.scopeKey, familyId]).delete();
        await catalogOfflineDb.products.where("scopeKey").equals(scope.scopeKey)
          .filter((product) => product.familyId === familyId).delete();
        await catalogOfflineDb.families.delete(key);
      },
    );
    return removable;
  },

  async unpinnedAssetsOldestFirst(scope: CatalogOfflineScope) {
    const rows = await catalogOfflineDb.assets.where("scopeKey").equals(scope.scopeKey)
      .filter((asset) => asset.pinCount === 0).toArray();
    return rows.sort((left, right) => left.lastAccessAt - right.lastAccessAt);
  },

  deleteAsset(scope: CatalogOfflineScope, contentHash: string) {
    return catalogOfflineDb.assets.delete(assetKey(scope, contentHash));
  },
};
