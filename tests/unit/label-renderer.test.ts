import { describe, expect, it } from "vitest";
import bwipjs from "bwip-js/browser";
import {
  BinaryBitmap,
  DataMatrixReader,
  DecodeHintType,
  HybridBinarizer,
  RGBLuminanceSource,
} from "@zxing/library";

import { renderLabelDocument, validateLabelFit } from "@/features/barcode/labels/label-renderer";
import type { LabelProfile, ProductBarcode } from "@/features/barcode/types";
import { createProductInitialValues } from "@/features/app/inventory/form/product-form.initial";

const profile: LabelProfile = { id: "test", name: "test", kind: "thermal", widthMm: 50, heightMm: 30, marginMm: 2, horizontalGapMm: 0, verticalGapMm: 0, columns: 1, showPrice: true, showStoreName: false, showPackageQuantity: true };
const barcode: ProductBarcode = { id: 1, product_id: 2, value: "TZ-0123456789AB", source: "tanzim", symbology: "code128", meaning: "package", scan_quantity: 12, is_active: true, is_default: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };

function decodeDataMatrix(value: string) {
  const symbol = bwipjs.raw("datamatrix", value, "")[0] as {
    pixs: number[];
    pixx: number;
    pixy: number;
  };
  const quiet = 4;
  const scale = 4;
  const width = (symbol.pixx + quiet * 2) * scale;
  const height = (symbol.pixy + quiet * 2) * scale;
  const luminance = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < symbol.pixy; y += 1) {
    for (let x = 0; x < symbol.pixx; x += 1) {
      if (!symbol.pixs[y * symbol.pixx + x]) continue;
      const top = (y + quiet) * scale;
      const left = (x + quiet) * scale;
      for (let dy = 0; dy < scale; dy += 1) {
        luminance.fill(0, (top + dy) * width + left, (top + dy) * width + left + scale);
      }
    }
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)));
  const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.PURE_BARCODE, true]]);
  return new DataMatrixReader().decode(bitmap, hints).getText();
}

describe("label renderer", () => {
  it("renders exact millimetre dimensions, vector bars, Persian text and requested copies", async () => {
    const product = { ...createProductInitialValues(), id: 2, custom_label: "پیچ صنعتی", price: 125000 };
    const html = await renderLabelDocument([{ product, barcode, copies: 2 }], { ...profile, showStoreName: true }, "فروشگاه تنظیم");
    expect(html).toContain("width:50mm;height:30mm");
    expect(html).toContain("<svg");
    expect(html).toContain("پیچ صنعتی");
    expect(html).toContain("font-family:Vazirmatn");
    expect(html).toContain("Vazirmatn-Variable.woff2");
    expect(html).toContain("فروشگاه تنظیم");
    expect(html.match(/<article/g)).toHaveLength(2);
  });

  it("rejects values whose modules cannot fit the configured quiet-zone width", () => {
    expect(() => validateLabelFit("X".repeat(64), { ...profile, widthMm: 20 })).toThrow(/عرض لیبل/);
  });

  it("encodes and decodes the longest 128-bit custom-category value on both current label profiles", async () => {
    const longestCustomInternal = "TZ1-24-C0123456789ABC-0123456789ABCDEFGHJKMNPQRS";
    expect(longestCustomInternal).toHaveLength(48);
    expect(() => validateLabelFit(longestCustomInternal, profile, "datamatrix")).not.toThrow();
    expect(() => validateLabelFit(longestCustomInternal, {
      ...profile,
      id: "a4-3-column",
      kind: "a4",
      widthMm: 63.5,
      heightMm: 38.1,
      marginMm: 7,
      horizontalGapMm: 2.5,
      columns: 3,
    }, "datamatrix")).not.toThrow();
    expect(decodeDataMatrix(longestCustomInternal)).toBe(longestCustomInternal);

    const product = { ...createProductInitialValues(), id: 3, custom_label: "قطعه طولانی" };
    const html = await renderLabelDocument([{
      product,
      barcode: { ...barcode, id: 2, value: longestCustomInternal, symbology: "datamatrix", meaning: "unit", scan_quantity: 1 },
      copies: 1,
    }], profile);
    expect(html).toContain('data-symbology="datamatrix"');
    expect(html).toContain(longestCustomInternal);
  });
});
