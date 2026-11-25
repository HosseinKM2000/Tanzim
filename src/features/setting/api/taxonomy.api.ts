import { apiFetch } from "@/shared/api/client";

export type ReferenceSector = {
  id: number;
  reference_key: string;
  code: string;
  name_fa: string;
  taxonomy_version: string;
  custom_categories_allowed: boolean;
};

export type TaxonomyState = {
  taxonomy_version: string | null;
  taxonomy_policy_version: number;
  sector_code: string | null;
  adopted_at: string | null;
  has_historical_inventory_usage: boolean;
  adoption_enabled: boolean;
};

export type RecategorizationTarget = {
  product_id: number;
  version: number;
  current_category_id: number | null;
  internal_labels_to_replace: number;
};

export type RecategorizationPreview = {
  store_id: number;
  destination_category_id: number;
  targets: RecategorizationTarget[];
  expires_at: string;
  confirmation_token: string;
};

export function getReferenceSectors() {
  return apiFetch<ReferenceSector[]>("/taxonomy/sectors");
}

export function getTaxonomyState() {
  return apiFetch<TaxonomyState>("/taxonomy/state");
}

export function adoptTaxonomy(sectorCode: string, expectedPolicyVersion: number) {
  return apiFetch<TaxonomyState>("/taxonomy/adopt", {
    method: "POST",
    json: { sector_code: sectorCode, expected_policy_version: expectedPolicyVersion },
  });
}

export function previewRecategorization(productIds: number[], destinationCategoryId: number) {
  return apiFetch<RecategorizationPreview>("/taxonomy/recategorization/preview", {
    method: "POST",
    json: { product_ids: productIds, destination_category_id: destinationCategoryId },
  });
}

export function confirmRecategorization(preview: RecategorizationPreview, operationId = crypto.randomUUID()) {
  return apiFetch<{ status: "applied"; operation_id: string; replacements: Array<{ product_id: number; barcode: string | null }> }>(
    "/taxonomy/recategorization/confirm",
    {
      method: "POST",
      json: {
        operation_id: operationId,
        destination_category_id: preview.destination_category_id,
        targets: preview.targets,
        expires_at: preview.expires_at,
        confirmation_token: preview.confirmation_token,
      },
    },
  );
}
