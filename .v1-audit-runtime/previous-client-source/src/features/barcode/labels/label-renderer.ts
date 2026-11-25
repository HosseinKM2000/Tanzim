import type { Product } from "@/features/app/inventory/types";
import type { BarcodeSymbology, LabelProfile, ProductBarcode } from "../types";

export type LabelItem = { product: Product; barcode: ProductBarcode; copies: number };

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function validateLabelFit(value: string, profile: LabelProfile, symbology: BarcodeSymbology = "code128") {
  if (symbology === "datamatrix") {
    // A printable-ASCII payload up to our 64-character storage ceiling fits
    // within a 48x48 ECC200 symbol. Four quiet modules on each side leave a
    // conservative 56-module square, still comfortably above 0.25 mm/module
    // on both built-in profiles.
    const estimatedModules = 56;
    const usableWidth = profile.widthMm - (profile.marginMm * 2);
    const usableHeight = Math.max(0, profile.heightMm * 0.58);
    if (Math.min(usableWidth, usableHeight) / estimatedModules < 0.25) {
      throw new Error("این Data Matrix برای اندازه لیبل انتخابی بیش از حد متراکم است");
    }
    return;
  }
  const estimatedModules = 11 * (value.length + 3) + 35;
  const usableWidth = profile.widthMm - (profile.marginMm * 2);
  if (usableWidth / estimatedModules < 0.19) {
    throw new Error("این بارکد برای عرض لیبل انتخابی بیش از حد بلند است");
  }
}

type SvgRenderer = (options: {
  bcid: string;
  text: string;
  scale: number;
  height?: number;
  includetext?: boolean;
  paddingwidth: number;
  paddingheight: number;
}) => string;

function renderOne(item: LabelItem, profile: LabelProfile, toSVG: SvgRenderer, storeName?: string) {
  const isMatrix = item.barcode.symbology === "datamatrix";
  validateLabelFit(item.barcode.value, profile, item.barcode.symbology);
  const productName = item.product.custom_label || item.product.catalog_product?.name || "محصول";
  const svg = toSVG(isMatrix
    ? {
        bcid: "datamatrix", text: item.barcode.value, scale: 4,
        paddingwidth: 2, paddingheight: 2,
      }
    : {
        bcid: "code128", text: item.barcode.value, scale: 2,
        height: Math.max(7, profile.heightMm * 0.34), includetext: false,
        paddingwidth: 8, paddingheight: 0,
      });
  const packageText = item.barcode.meaning === "package" && profile.showPackageQuantity
    ? `<div class="meta">هر اسکن: ${item.barcode.scan_quantity.toLocaleString("fa-IR")} واحد</div>` : "";
  const salePrice = item.product.sale_price ?? (item.product.price_missing ? null : item.product.price);
  const price = profile.showPrice && salePrice != null ? `<div class="price">${salePrice.toLocaleString("fa-IR")} تومان</div>` : "";
  const store = profile.showStoreName && storeName ? `<div class="store">${escapeHtml(storeName)}</div>` : "";
  const barcodeClass = isMatrix ? "barcode barcode--matrix" : "barcode barcode--linear";
  const valueClass = item.barcode.value.length > 32 ? "value value--long" : "value";
  return `<article class="label" dir="rtl" data-symbology="${item.barcode.symbology}">${store}<div class="name">${escapeHtml(productName)}</div><div class="${barcodeClass}" dir="ltr">${svg}</div><div class="${valueClass}" dir="ltr">${escapeHtml(item.barcode.value)}</div>${packageText}${price}</article>`;
}

export async function renderLabelDocument(items: LabelItem[], profile: LabelProfile, storeName?: string) {
  const { default: bwipjs } = await import("bwip-js/browser");
  const labels = items.flatMap((item) => Array.from({ length: item.copies }, () => renderOne(item, profile, bwipjs.toSVG, storeName))).join("");
  const pageSize = profile.kind === "thermal" ? `${profile.widthMm}mm ${profile.heightMm}mm` : "A4";
  const fontUrl = new URL("/fonts/vazirmatn/Vazirmatn-Variable.woff2", window.location.origin).href;
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>لیبل محصولات تنظیم</title><style>
@page{size:${pageSize};margin:${profile.kind === "thermal" ? "0" : `${profile.marginMm}mm`}}
@font-face{font-family:Vazirmatn;src:url('${fontUrl}') format('woff2-variations');font-style:normal;font-weight:100 900;font-display:block}
*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Vazirmatn,Tahoma,Arial,sans-serif;color:#17151f}
.sheet{display:grid;grid-template-columns:repeat(${profile.columns},${profile.widthMm}mm);gap:${profile.verticalGapMm}mm ${profile.horizontalGapMm}mm;align-content:start;justify-content:${profile.kind === "a4" ? "center" : "start"}}
.label{width:${profile.widthMm}mm;height:${profile.heightMm}mm;padding:${profile.marginMm}mm;overflow:hidden;break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.name{font-size:10pt;font-weight:700;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.store,.meta{font-size:7pt}.price{font-size:8pt;font-weight:700}.value{font:7pt ui-monospace,Consolas,monospace;letter-spacing:.05em;white-space:nowrap}.value--long{font-size:4.25pt;letter-spacing:0}.barcode{width:100%;min-height:7mm;display:flex;align-items:center;justify-content:center}.barcode--linear svg{display:block;width:100%;height:auto;max-height:${Math.max(8, profile.heightMm * 0.38)}mm}.barcode--matrix svg{display:block;width:auto;height:${Math.max(12, Math.min(18, profile.heightMm * 0.55))}mm;max-width:100%}
@media screen{body{background:#eee;padding:12px}.label{background:white;outline:1px dashed #aaa}.sheet{justify-content:center}}
@media print{body{background:white}.label{outline:none}}
</style></head><body><main class="sheet">${labels}</main></body></html>`;
}
