import { useState } from "react";

import { resolveAssetUrl } from "@/shared/api/client";
import { useResolvedReferenceImage } from "@/shared/lib/infrastructure/media/useImage";
import { useOfflineCatalogImage } from "@/features/catalog-offline/use-offline-catalog-image";
import type { CatalogReferenceAssetSummary } from "../types";

export function useCatalogImage(
  detailPath: string | null | undefined,
  previewPath: string | null | undefined,
  legacyPath: string | null | undefined,
  persistent?: { enabled: boolean; failed?: boolean; asset?: CatalogReferenceAssetSummary | null; releaseId?: string; familySlug?: string | null },
) {
  const candidateReference = detailPath ?? previewPath;
  const [failedReference, setFailedReference] = useState<string>();
  const [failedLegacy, setFailedLegacy] = useState<string>();
  const referencePath = candidateReference === failedReference ? undefined : candidateReference;
  const cached = useOfflineCatalogImage(
    persistent?.enabled ? persistent.asset : undefined,
    persistent?.enabled ? persistent.releaseId : undefined,
    persistent?.enabled ? persistent.familySlug ?? undefined : undefined,
  );
  const persistentIntent = Boolean(persistent?.enabled && persistent.asset);
  const persistentCandidate = Boolean(persistentIntent && persistent?.releaseId);
  const persistentWaiting = persistentIntent && !persistentCandidate && !persistent?.failed;
  const reference = useResolvedReferenceImage(persistentIntent ? undefined : referencePath);
  const usingPersistent = persistentCandidate && Boolean(cached.src && !cached.error);
  const usingReference = !persistentCandidate && Boolean(referencePath && !reference.error);
  const legacySrc = legacyPath && legacyPath !== failedLegacy
    ? resolveAssetUrl(legacyPath)
    : undefined;
  return {
    src: usingPersistent
      ? cached.src
      : persistentCandidate
        ? (cached.error ? legacySrc : undefined)
        : persistentIntent
          ? (persistent?.failed ? legacySrc : undefined)
          : usingReference ? reference.src : legacySrc,
    loading: persistentWaiting || (persistentCandidate ? cached.loading : usingReference && reference.loading),
    onError: () => {
      if (usingReference && referencePath) setFailedReference(referencePath);
      else if (legacyPath) setFailedLegacy(legacyPath);
    },
  };
}
