import AddProductForm from "@/features/app/inventory/components/add-inventory-form";
import { createFileRoute } from "@tanstack/react-router";
import { CapabilityGuard } from "@/shared/access/capability-guard";

export const Route = createFileRoute("/(app)/inventory/add")({
  validateSearch: (search: Record<string, unknown>) => ({
    catalogId: typeof search.catalogId === "number" && Number.isSafeInteger(search.catalogId) && search.catalogId > 0
      ? search.catalogId
      : undefined,
  }),
  component: AddInventoryRoute,
});

function AddInventoryRoute() {
  const { catalogId } = Route.useSearch();
  return <CapabilityGuard capability="inventory.write"><AddProductForm catalogId={catalogId} /></CapabilityGuard>;
}
