import { CatalogPreferences } from "@/features/setting/components/catalog-preferences";
import { CatalogAdoption } from "@/features/setting/components/catalog-adoption";
import { createFileRoute } from "@tanstack/react-router";
import { Flex, Spinner } from "@radix-ui/themes";
import { useCatalogAdoptionStatus } from "@/features/setting/mutations/use-catalog";

export const Route = createFileRoute("/tools/catalog")({ component: CatalogRoute });

function CatalogRoute() {
  const status = useCatalogAdoptionStatus();
  if (status.isLoading) return <Flex justify="center" py="8"><Spinner size="3" /></Flex>;
  if (status.data?.enabled === true) return <CatalogAdoption />;
  return <CatalogPreferences />;
}
