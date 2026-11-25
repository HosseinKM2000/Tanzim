import { apiFetch } from "@/shared/api/client";

import type {
  CatalogFamilyManifest,
  CatalogFamilySummary,
  CatalogManifestAsset,
  CatalogReleaseSummary,
} from "./types";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validateFamilyManifest(
  manifest: CatalogFamilyManifest,
  expected: { industryId: number; releaseId: string; familySlug: string },
) {
  if (
    manifest.schema_version !== 1
    || manifest.industry_id !== expected.industryId
    || manifest.release_id !== expected.releaseId
    || manifest.family_slug !== expected.familySlug
    || !Array.isArray(manifest.products)
  ) throw new Error("CATALOG_MANIFEST_SCOPE_INVALID");
  const assets = new Map<string, CatalogManifestAsset>();
  for (const product of manifest.products) {
    if (!Number.isSafeInteger(product.id) || product.id < 1 || product.industry_id !== expected.industryId) {
      throw new Error("CATALOG_MANIFEST_PRODUCT_INVALID");
    }
    for (const asset of [product.preview, product.detail]) {
      if (!asset) continue;
      if (
        !asset.asset_id
        || !/^[a-f0-9]{64}$/.test(asset.content_hash)
        || asset.byte_size < 1
        || asset.width < 1
        || asset.height < 1
      ) throw new Error("CATALOG_MANIFEST_ASSET_INVALID");
      assets.set(asset.content_hash, asset);
    }
  }
  const { content_hash: contentHash, ...unsealed } = manifest;
  if (!/^[a-f0-9]{64}$/.test(contentHash) || await sha256(canonical(unsealed)) !== contentHash) {
    throw new Error("CATALOG_MANIFEST_HASH_INVALID");
  }
  if (manifest.product_count !== manifest.products.length) throw new Error("CATALOG_MANIFEST_COUNT_INVALID");
  if (manifest.asset_count !== assets.size) throw new Error("CATALOG_MANIFEST_ASSET_COUNT_INVALID");
  const totalBytes = [...assets.values()].reduce((sum, asset) => sum + asset.byte_size, 0);
  if (manifest.total_bytes !== totalBytes) throw new Error("CATALOG_MANIFEST_BYTES_INVALID");
  return manifest;
}

export function getCatalogFamilies() {
  return apiFetch<CatalogFamilySummary[]>("/catalog-reference/families");
}

export function getCurrentCatalogRelease() {
  return apiFetch<CatalogReleaseSummary | null>("/catalog-reference/releases/current");
}

export async function getCatalogFamilyManifest(
  industryId: number,
  releaseId: string,
  familySlug: string,
) {
  const manifest = await apiFetch<CatalogFamilyManifest>(
    `/catalog-reference/releases/${encodeURIComponent(releaseId)}/manifest?family_slug=${encodeURIComponent(familySlug)}`,
  );
  return validateFamilyManifest(manifest, { industryId, releaseId, familySlug });
}

export function getPublishedReferenceAsset(
  asset: CatalogManifestAsset,
  releaseId: string,
  familySlug?: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ release_id: releaseId });
  if (familySlug) query.set("family_slug", familySlug);
  return apiFetch<Blob>(`/catalog-reference-assets/${encodeURIComponent(asset.asset_id)}?${query}`, {
    responseType: "blob",
    signal,
  });
}

export const catalogManifestIntegrity = { canonical, sha256 };
