import { accessState } from "@/shared/access/access-state";

import type { CatalogOfflineScope } from "./types";

export function currentCatalogScope(): CatalogOfflineScope | null {
  const user = accessState.user();
  const industryId = user?.industry_id;
  if (!user || !user.store_id || !industryId || !accessState.canUseTool("catalog")) return null;
  return {
    ownerUserId: user.id,
    storeId: user.store_id,
    industryId,
    scopeKey: `${user.id}:${user.store_id}:${industryId}`,
  };
}

export function requireCatalogScope(): CatalogOfflineScope {
  const scope = currentCatalogScope();
  if (!scope) throw new Error("CATALOG_OFFLINE_ACCESS_REQUIRED");
  return scope;
}

export function familyKey(scope: CatalogOfflineScope, familyId: number) {
  return `${scope.scopeKey}:family:${familyId}`;
}

export function productKey(scope: CatalogOfflineScope, releaseId: string, familyId: number, productId: number) {
  return `${scope.scopeKey}:product:${releaseId}:${familyId}:${productId}`;
}

export function assetKey(scope: CatalogOfflineScope, contentHash: string) {
  return `${scope.scopeKey}:asset:${contentHash}`;
}
