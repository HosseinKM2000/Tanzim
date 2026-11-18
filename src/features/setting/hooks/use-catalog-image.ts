import { useState } from "react";

import { resolveAssetUrl } from "@/shared/api/client";
import { useResolvedReferenceImage } from "@/shared/lib/infrastructure/media/useImage";

export function useCatalogImage(
  detailPath: string | null | undefined,
  previewPath: string | null | undefined,
  legacyPath: string | null | undefined,
) {
  const candidateReference = detailPath ?? previewPath;
  const [failedReference, setFailedReference] = useState<string>();
  const [failedLegacy, setFailedLegacy] = useState<string>();
  const referencePath = candidateReference === failedReference ? undefined : candidateReference;
  const reference = useResolvedReferenceImage(referencePath);
  const usingReference = Boolean(referencePath && !reference.error);
  const legacySrc = legacyPath && legacyPath !== failedLegacy
    ? resolveAssetUrl(legacyPath)
    : undefined;
  return {
    src: usingReference ? reference.src : legacySrc,
    loading: usingReference && reference.loading,
    onError: () => {
      if (usingReference && referencePath) setFailedReference(referencePath);
      else if (legacyPath) setFailedLegacy(legacyPath);
    },
  };
}
