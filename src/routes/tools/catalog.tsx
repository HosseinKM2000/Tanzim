import { CatalogPreferences } from "@/features/setting/components/catalog-preferences";
import { CatalogAdoption } from "@/features/setting/components/catalog-adoption";
import { CatalogAdoptionV2 } from "@/features/setting/components/catalog-adoption-v2";
import { createFileRoute } from "@tanstack/react-router";
import { Flex, Spinner } from "@radix-ui/themes";
import { useCatalogAdoptionStatus } from "@/features/setting/mutations/use-catalog";
import { CatalogOfflineBrowser } from "@/features/catalog-offline/catalog-offline-browser";
import { networkService } from "@/shared/lib/infrastructure/network/network-service";
import { useSyncExternalStore } from "react";

export const Route = createFileRoute("/tools/catalog")({ component: CatalogRoute });

function CatalogRoute() {
  const status = useCatalogAdoptionStatus();
  const offline = useSyncExternalStore(
    (listener) => networkService.subscribe(listener),
    () => networkService.isOffline(),
    () => false,
  );
  if (status.isLoading) return <Flex justify="center" py="8"><Spinner size="3" /></Flex>;
  if (status.data?.offline_families_v1_enabled && offline) return <CatalogOfflineBrowser />;
  if (status.data?.enabled === true && status.data.cursor_read_v2_enabled) return <CatalogAdoptionV2 offlineCacheEnabled={status.data.offline_families_v1_enabled} />;
  if (status.data?.enabled === true) return <CatalogAdoption />;
  return <CatalogPreferences />;
}
