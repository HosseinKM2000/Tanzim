import type { Product } from "@/features/app/inventory/types";
import { barcodeService } from "@/features/barcode/services/barcode-service";
import type { ProductBarcode } from "@/features/barcode/types";
import { accessState } from "@/shared/access/access-state";
import { assertSyncAccountCurrent, captureSyncAccountContext } from "@/shared/lib/infrastructure/sync/sync-account-context";

export type InvoiceBarcodeResult =
  | { kind: "unique"; product: Product; barcode: ProductBarcode }
  | { kind: "unknown" }
  | { kind: "retired" }
  | { kind: "ambiguous" };

export async function lookupInvoiceBarcode(value: string, products: Product[], invoiceType: "purchase" | "sale"): Promise<InvoiceBarcodeResult> {
  accessState.requireCapability(invoiceType === "purchase" ? "invoices.purchase" : "invoices.sale");
  accessState.requireCapability("barcode.lookup");
  accessState.requireStorePermission("barcodes.lookup");
  const account = captureSyncAccountContext();
  const resolution = await barcodeService.resolve(value);
  assertSyncAccountCurrent(account);
  if (resolution.status === "unknown") return { kind: "unknown" };
  if (resolution.status === "retired") return { kind: "retired" };
  if (resolution.status === "ambiguous") return { kind: "ambiguous" };
  const productId = resolution.productId;
  const barcode = resolution.barcode;
  const product = products.find((item) => item.id === productId && !item.deleted_at && !item.is_hidden);
  return product ? { kind: "unique", product, barcode } : { kind: "unknown" };
}
