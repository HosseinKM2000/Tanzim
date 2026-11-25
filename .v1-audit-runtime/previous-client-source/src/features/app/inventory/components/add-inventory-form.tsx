import { ApiError } from "@/shared/api/api-error";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useCreateProduct } from "../mutations/use-products";
import type { Product } from "../types";
import { ProductForm } from "./inventory-form";
import { userErrorMessage } from "@/shared/lib/presentation/user-error";
import { useCatalogAdoptionStatus, useCatalogProduct } from "@/features/setting/mutations/use-catalog";
import { createLocalEntityId } from "@/shared/lib/infrastructure/storage/local-entity-id";
import { Callout, Flex, Spinner } from "@radix-ui/themes";

export function catalogAdoptionDraft(catalog: NonNullable<Product["catalog_product"]>): Product {
  const now = new Date().toISOString();
  return {
    id: createLocalEntityId(), catalog_product_id: catalog.id, is_catalog_backed: true,
    category_id: null, label_ids: [], quantity: 0, price: 0, sale_price: null,
    purchase_price: null, price_missing: true, custom_label: "", note: null,
    low_stock_threshold: 0, low_stock_alert: false, is_hidden: false,
    image_url: null, deleted_at: null, status: "out_of_stock", created_at: now,
    updated_at: now, catalog_product: catalog,
  };
}

const AddProductForm = ({ catalogId }: { catalogId?: number }) => {
  const navigate = useNavigate();
  const createProduct = useCreateProduct();
  const adoptionStatus = useCatalogAdoptionStatus();
  const catalog = useCatalogProduct(catalogId ?? 0, Boolean(catalogId) && adoptionStatus.data?.enabled === true);

  if (catalogId && (adoptionStatus.isLoading || catalog.isLoading)) {
    return <Flex justify="center" py="8"><Spinner size="3" /></Flex>;
  }
  if (catalogId && (adoptionStatus.isError || adoptionStatus.data?.enabled !== true || catalog.isError || !catalog.data)) {
    return <Callout.Root color="red" dir="rtl"><Callout.Text>این محصول کاتالوگ برای افزودن در دسترس نیست.</Callout.Text></Callout.Root>;
  }
  const initial = catalog.data ? catalogAdoptionDraft(catalog.data) : undefined;

  return (
    <ProductForm
      mode="create"
      initial={initial}
      submitting={createProduct.isPending}
      errorMessage={createProduct.error instanceof ApiError ? userErrorMessage(createProduct.error, "ایجاد محصول انجام نشد.") : null}
      onSubmit={(input, pendingBarcodes) => createProduct.mutate({ product: input as Product, pendingBarcodes }, {
        onSuccess: async () => {
          toast.success("محصول و بارکدهای آن ایجاد شد");
          void navigate({ to: "/inventory/list" });
        },
        onError: (error) => toast.error(userErrorMessage(error, "ایجاد محصول انجام نشد.")),
      })}
    />
  );
};

export default AddProductForm;
