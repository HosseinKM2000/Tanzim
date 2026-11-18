import type { CatalogProduct } from "@/features/setting/types";

export type CatalogDownloadState =
  | "queued"
  | "downloading"
  | "paused"
  | "verifying"
  | "complete"
  | "partial"
  | "failed"
  | "cancelled"
  | "update_available";

export type CatalogOfflineScope = {
  ownerUserId: number;
  storeId: number;
  industryId: number;
  scopeKey: string;
};

export type CatalogManifestAsset = {
  asset_id: string;
  content_hash: string;
  storage_key: string;
  width: number;
  height: number;
  byte_size: number;
};

export type CatalogManifestProduct = Pick<
  CatalogProduct,
  "id" | "industry_id" | "name" | "brand" | "description" | "image_url"
  | "is_packaged" | "pack_size" | "created_at"
> & {
  preview: CatalogManifestAsset | null;
  detail: CatalogManifestAsset | null;
};

export type CatalogFamilyManifest = {
  schema_version: 1;
  industry_id: number;
  family_id: number;
  family_slug: string;
  release_id: string;
  release_version: number;
  generated_at: string;
  product_count: number;
  asset_count: number;
  total_bytes: number;
  products: CatalogManifestProduct[];
  content_hash: string;
};

export type CatalogOfflineFamily = {
  key: string;
  scopeKey: string;
  ownerUserId: number;
  storeId: number;
  industryId: number;
  familyId: number;
  slug: string;
  name: string;
  activeReleaseId?: string;
  activeIncludeDetails?: boolean;
  pendingReleaseId?: string;
  includeDetails: boolean;
  state: CatalogDownloadState;
  productCount: number;
  requiredAssets: number;
  verifiedAssets: number;
  totalBytes: number;
  verifiedBytes: number;
  lastVerifiedAt?: number;
  updateAvailable: boolean;
  lastError?: string;
  updatedAt: number;
};

export type CatalogOfflineProduct = CatalogProduct & {
  key: string;
  scopeKey: string;
  ownerUserId: number;
  storeId: number;
  familyId: number;
  familySlug: string;
  releaseId: string;
  normalizedName: string;
  preview?: CatalogManifestAsset | null;
  detail?: CatalogManifestAsset | null;
};

export type CatalogOfflineRelease = {
  key: string;
  scopeKey: string;
  releaseId: string;
  industryId: number;
  version: number;
  status: string;
  manifestHash?: string | null;
  checkedAt: number;
  adoptionEnabled: boolean;
  cursorEnabled: boolean;
  referenceEnabled: boolean;
  offlineEnabled: boolean;
};

export type CatalogReferenceAssetRecord = {
  key: string;
  scopeKey: string;
  ownerUserId: number;
  storeId: number;
  industryId: number;
  assetId: string;
  contentHash: string;
  storageKey: string;
  variant: "preview" | "detail";
  byteSize: number;
  width: number;
  height: number;
  mimeType: "image/webp";
  localPath: string;
  state: "verified" | "missing" | "corrupt";
  pinCount: number;
  lastVerifiedAt?: number;
  lastAccessAt: number;
};

export type CatalogDownloadJob = {
  id: string;
  scopeKey: string;
  ownerUserId: number;
  storeId: number;
  industryId: number;
  familyId: number;
  familySlug: string;
  familyName: string;
  releaseId: string;
  releaseVersion: number;
  includeDetails: boolean;
  state: CatalogDownloadState;
  totalEntries: number;
  completedEntries: number;
  totalBytes: number;
  completedBytes: number;
  retryCount: number;
  autoResume: boolean;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

export type CatalogDownloadEntry = {
  key: string;
  jobId: string;
  scopeKey: string;
  assetId: string;
  contentHash: string;
  storageKey: string;
  variant: "preview" | "detail";
  byteSize: number;
  width: number;
  height: number;
  state: "pending" | "downloading" | "verified" | "failed";
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  updatedAt: number;
};

export type CatalogFamilySummary = {
  id: number;
  industry_id: number;
  slug: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export type CatalogReleaseSummary = {
  id: string;
  industry_id: number;
  version: number;
  status: "published" | "superseded" | "staging" | "failed";
  manifest_hash: string | null;
  published_at: string | null;
};
