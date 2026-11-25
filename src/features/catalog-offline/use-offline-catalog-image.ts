import { useEffect, useState } from "react";

import { catalogReferenceLoader, type CatalogReferencePriority } from "./catalog-reference-loader";
import { catalogDownloadService } from "./catalog-download.service";
import { currentCatalogScope } from "./scope";
import type { CatalogManifestAsset } from "./types";

export function useOfflineCatalogImage(
  asset: CatalogManifestAsset | null | undefined,
  releaseId: string | undefined,
  familySlug: string | undefined,
  priority: CatalogReferencePriority = "visible",
) {
  const [state, setState] = useState<{ key?: string; src?: string; error?: Error; loading: boolean }>({ loading: Boolean(asset) });
  const hash = asset?.content_hash;
  const key = asset && releaseId ? `${releaseId}:${familySlug ?? "published"}:${hash}` : undefined;
  useEffect(() => {
    const scope = currentCatalogScope();
    if (!asset || !releaseId || !scope) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    catalogReferenceLoader.load({ scope, asset, variant: priority === "detail" ? "detail" : "preview", releaseId, familySlug, priority, signal: controller.signal })
      .then((file) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(file);
        setState({ key, src: objectUrl, loading: false });
        void catalogDownloadService.trimAutomaticCache(scope);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ key, loading: false, error: error instanceof Error ? error : new Error("CATALOG_IMAGE_UNAVAILABLE") });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, hash, key, releaseId, familySlug, priority]);
  if (!key) return { loading: false };
  return state.key === key ? state : { loading: true };
}
