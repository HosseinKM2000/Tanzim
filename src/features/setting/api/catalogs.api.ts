import { apiFetch } from "@/shared/api/client";
import { networkService } from "@/shared/lib/infrastructure/network/network-service";
import { catalogOfflineRepository } from "@/features/catalog-offline/catalog-offline.repository";
import { currentCatalogScope } from "@/features/catalog-offline/scope";
import { getCurrentCatalogRelease } from "@/features/catalog-offline/catalog-offline.api";
import type {
  CatalogProduct,
  CatalogProductInput,
  CatalogProductListParams,
  CatalogProductUpdate,
  CatalogProductPage,
  CatalogAdoptionStatus,
} from "../types";

function requireOnline() {
  if (networkService.isOffline()) {
    throw new Error("مدیریت کاتالوگ به اتصال اینترنت نیاز دارد.");
  }
}

export function getCatalogProducts(params?: CatalogProductListParams) {
  requireOnline();
  const query = new URLSearchParams();

  if (params?.search) query.set("search", params.search);

  if (params?.industry_id) query.set("industry_id", String(params.industry_id));

  const queryString = query.toString();
  return apiFetch<CatalogProduct[]>(
    `/catalog-products${queryString ? `?${queryString}` : ""}`,
  );
}

export async function getCatalogAdoptionStatus() {
  const scope = currentCatalogScope();
  if (networkService.isOffline()) {
    const saved = scope ? await catalogOfflineRepository.latestRelease(scope) : undefined;
    if (!saved) requireOnline();
    return {
      enabled: saved!.adoptionEnabled,
      cursor_read_v2_enabled: saved!.cursorEnabled,
      reference_media_v1_enabled: saved!.referenceEnabled,
      offline_families_v1_enabled: saved!.offlineEnabled,
    };
  }
  const status = await apiFetch<CatalogAdoptionStatus>("/catalog-products/adoption-status");
  if (scope && status.offline_families_v1_enabled) {
    const release = await getCurrentCatalogRelease();
    if (release) {
      await catalogOfflineRepository.saveRelease(scope, {
        key: `${scope.scopeKey}:release:${release.id}`,
        scopeKey: scope.scopeKey,
        releaseId: release.id,
        industryId: scope.industryId,
        version: release.version,
        status: release.status,
        manifestHash: release.manifest_hash,
        checkedAt: Date.now(),
        adoptionEnabled: status.enabled,
        cursorEnabled: status.cursor_read_v2_enabled,
        referenceEnabled: status.reference_media_v1_enabled,
        offlineEnabled: status.offline_families_v1_enabled,
      });
    }
  }
  return status;
}

export function getCatalogProductsPage(
  params: CatalogProductListParams | undefined,
  cursor: string | undefined,
  signal?: AbortSignal,
) {
  requireOnline();
  const query = new URLSearchParams({ limit: "24" });
  if (params?.search?.trim()) query.set("search", params.search.trim());
  if (params?.industry_id) query.set("industry_id", String(params.industry_id));
  if (cursor) query.set("cursor", cursor);
  return apiFetch<CatalogProductPage>(`/catalog-products/page?${query}`, { signal });
}

export function getArchivedCatalogProducts(params?: CatalogProductListParams) {
  requireOnline();
  const query = new URLSearchParams();

  if (params?.search) query.set("search", params.search);
  if (params?.industry_id) query.set("industry_id", String(params.industry_id));

  const queryString = query.toString();
  return apiFetch<CatalogProduct[]>(
    `/catalog-products/archived${queryString ? `?${queryString}` : ""}`,
  );
}

export async function getCatalogProduct(id: number) {
  if (networkService.isOffline()) {
    const scope = currentCatalogScope();
    const product = scope ? await catalogOfflineRepository.product(scope, id) : undefined;
    if (product) return product;
    requireOnline();
  }
  return apiFetch<CatalogProduct>(`/catalog-products/${id}`);
}

export function createCatalogProduct(data: CatalogProductInput) {
  requireOnline();
  return apiFetch<CatalogProduct>("/catalog-products", {
    method: "POST",
    json: data,
  });
}

export function updateCatalogProduct(id: number, data: CatalogProductUpdate) {
  requireOnline();
  return apiFetch<CatalogProduct>(`/catalog-products/${id}`, {
    method: "PATCH",
    json: data,
  });
}

export function deleteCatalogProduct(id: number) {
  requireOnline();
  return apiFetch<void>(`/catalog-products/${id}`, {
    method: "DELETE",
  });
}

export function archiveCatalogProduct(id: number) {
  requireOnline();
  return apiFetch<CatalogProduct>(`/catalog-products/${id}/archive`, {
    method: "PATCH",
  });
}

export function restoreCatalogProduct(id: number) {
  requireOnline();
  return apiFetch<CatalogProduct>(`/catalog-products/${id}/restore`, {
    method: "PATCH",
  });
}
