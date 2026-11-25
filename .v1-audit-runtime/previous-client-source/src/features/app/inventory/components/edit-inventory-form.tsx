import { ApiError } from "@/shared/api/api-error";
import { Callout, Flex, Spinner, Text } from "@radix-ui/themes";
import { useNavigate } from "@tanstack/react-router";
import {
  useDeleteProduct,
  useProduct,
  useUpdateProduct,
} from "../mutations/use-products";
import { ProductForm } from "./inventory-form";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/shared/ui/dialog/confirm-dialog";
import type { Product, ProductInput } from "../types";
import { userErrorMessage } from "@/shared/lib/presentation/user-error";
import { confirmRecategorization, previewRecategorization, type RecategorizationPreview } from "@/features/setting/api/taxonomy.api";
import { syncMetadataStorage } from "@/shared/lib/infrastructure/storage/sync-metadata-storage";
import { syncService } from "@/shared/lib/infrastructure/sync/sync-service";
import {
  assertSyncAccountCurrent,
  captureSyncAccountContext,
} from "@/shared/lib/infrastructure/sync/sync-account-context";

function changedProductFields(current: Product, next: Product): ProductInput {
  const output: ProductInput = {};
  const keys = [
    "quantity", "sale_price", "purchase_price", "custom_label", "note", "category_id",
    "label_ids", "low_stock_threshold", "low_stock_alert", "image_url", "is_hidden", "catalog_product",
  ] as const;
  for (const key of keys) {
    if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) {
      Object.assign(output, { [key]: next[key] });
    }
  }
  return output;
}

type EditProductFormProps = {
  id: number;
};

const EditProductForm = ({ id }: EditProductFormProps) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingRecategorization, setPendingRecategorization] = useState<{
    preview: RecategorizationPreview;
    otherFields: ProductInput;
  } | null>(null);
  const [recategorizationBusy, setRecategorizationBusy] = useState(false);
  const navigate = useNavigate();
  const { data: product, isLoading, isError } = useProduct(id);
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  if (isLoading) {
    return (
      <Flex justify="center" align="center" py="9">
        <Spinner size="3" />
      </Flex>
    );
  }

  if (isError || !product) {
    return (
      <Callout.Root color="red" dir="rtl" mt="6">
        <Callout.Text>محصول یافت نشد</Callout.Text>
      </Callout.Root>
    );
  }

  const name = product.custom_label ?? product.catalog_product?.name ?? "محصول";

  return (
    <>
      <ProductForm
        mode="edit"
        initial={product}
        submitting={updateProduct.isPending || recategorizationBusy}
        deleting={deleteProduct.isPending}
        errorMessage={
          updateProduct.error instanceof ApiError
            ? userErrorMessage(updateProduct.error, "ویرایش محصول انجام نشد.")
            : null
        }
        onSubmit={(input) => {
          const changes = changedProductFields(product, input);
          if (changes.category_id !== undefined && changes.category_id !== product.category_id) {
            const account = captureSyncAccountContext();
            void syncMetadataStorage.getString("taxonomy-version").then(async (taxonomyVersion) => {
              assertSyncAccountCurrent(account);
              if (taxonomyVersion) {
                if (changes.category_id == null) {
                  toast.error("پس از پذیرش دسته‌بندی جدید، حذف دسته از محصول مجاز نیست.");
                  return;
                }
                setRecategorizationBusy(true);
                try {
                  const preview = await previewRecategorization([id], changes.category_id);
                  assertSyncAccountCurrent(account);
                  const otherFields = { ...changes };
                  delete otherFields.category_id;
                  setPendingRecategorization({ preview, otherFields });
                } catch (cause) {
                  toast.error(userErrorMessage(cause, "پیش‌نمایش تغییر دسته انجام نشد."));
                } finally {
                  setRecategorizationBusy(false);
                }
                return;
              }
              updateProduct.mutate({ id, input: changes }, {
                onSuccess: () => { toast.success(`«${name}» ویرایش شد`); void navigate({ to: "/inventory/list" }); },
                onError: (cause) => toast.error(userErrorMessage(cause, "ویرایش محصول انجام نشد.")),
              });
            });
            return;
          }
          updateProduct.mutate({ id, input: changes }, {
            onSuccess: () => { toast.success(`«${name}» ویرایش شد`); void navigate({ to: "/inventory/list" }); },
            onError: (cause) => toast.error(userErrorMessage(cause, "ویرایش محصول انجام نشد.")),
          });
        }}
        onDelete={() => setConfirmingDelete(true)}
      />
      <ConfirmDialog
        open={pendingRecategorization !== null}
        onOpenChange={(open) => { if (!open) setPendingRecategorization(null); }}
        title="تغییر دسته و جایگزینی بارکد داخلی؟"
        description="بارکدهای خارجی حفظ می‌شوند. بارکدهای داخلی فعال بازنشسته و با کد تازه‌ی دسته مقصد جایگزین می‌شوند."
        details={pendingRecategorization ? (
          <Flex direction="column" gap="1">
            <Text size="2">محصول متاثر: {pendingRecategorization.preview.targets.length.toLocaleString("fa-IR")}</Text>
            <Text size="2">برچسب داخلی نیازمند چاپ مجدد: {pendingRecategorization.preview.targets.reduce((sum, target) => sum + target.internal_labels_to_replace, 0).toLocaleString("fa-IR")}</Text>
          </Flex>
        ) : null}
        confirmLabel="تأیید تغییر دسته"
        cancelLabel="لغو و بازگشت به فرم"
        loading={recategorizationBusy}
        onConfirm={() => {
          if (!pendingRecategorization) return;
          const account = captureSyncAccountContext();
          setRecategorizationBusy(true);
          void (async () => {
            try {
              await confirmRecategorization(pendingRecategorization.preview);
              assertSyncAccountCurrent(account);
              if (Object.keys(pendingRecategorization.otherFields).length) {
                await updateProduct.mutateAsync({ id, input: pendingRecategorization.otherFields });
                assertSyncAccountCurrent(account);
              }
              await syncService.sync();
              assertSyncAccountCurrent(account);
              setPendingRecategorization(null);
              toast.success(`دسته «${name}» با ثبت سابقه تغییر کرد`);
              void navigate({ to: "/inventory/list" });
            } catch (cause) {
              toast.error(userErrorMessage(cause, "تغییر دسته انجام نشد؛ پیش‌نمایش را دوباره بررسی کنید."));
            } finally {
              setRecategorizationBusy(false);
            }
          })();
        }}
      />
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="محصول حذف شود؟"
        description={`«${name}» از موجودی حذف می‌شود.`}
        confirmLabel="حذف محصول"
        cancelLabel="لغو"
        variant="danger"
        loading={deleteProduct.isPending}
        onConfirm={() =>
          deleteProduct.mutate(id, {
            onSuccess: () => {
              toast.success(`«${name}» حذف شد.`);
              void navigate({ to: "/inventory/list" });
            },
            onError: (error) => {
              toast.error(userErrorMessage(error, "حذف محصول انجام نشد."));
            },
          })
        }
      />
    </>
  );
};

export default EditProductForm;
