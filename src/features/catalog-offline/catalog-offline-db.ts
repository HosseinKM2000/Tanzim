import Dexie, { type EntityTable } from "dexie";

import type {
  CatalogDownloadEntry,
  CatalogDownloadJob,
  CatalogOfflineFamily,
  CatalogOfflineProduct,
  CatalogOfflineRelease,
  CatalogReferenceAssetRecord,
} from "./types";

export class CatalogOfflineDatabase extends Dexie {
  families!: EntityTable<CatalogOfflineFamily, "key">;
  products!: EntityTable<CatalogOfflineProduct, "key">;
  releases!: EntityTable<CatalogOfflineRelease, "key">;
  assets!: EntityTable<CatalogReferenceAssetRecord, "key">;
  jobs!: EntityTable<CatalogDownloadJob, "id">;
  entries!: EntityTable<CatalogDownloadEntry, "key">;

  constructor(name = "tanzim-catalog-offline-v1") {
    super(name);
    this.version(1).stores({
      families: "key, scopeKey, [scopeKey+familyId], [scopeKey+slug], state, updatedAt",
      products: "key, scopeKey, [scopeKey+familyId+releaseId], [scopeKey+id], normalizedName",
      releases: "key, scopeKey, [scopeKey+releaseId], checkedAt",
      assets: "key, scopeKey, [scopeKey+contentHash], assetId, pinCount, lastAccessAt, state",
      jobs: "id, scopeKey, [scopeKey+familyId], state, updatedAt",
      entries: "key, jobId, [scopeKey+jobId], state, nextAttemptAt",
    });
  }
}

export const catalogOfflineDb = new CatalogOfflineDatabase();
