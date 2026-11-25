import { apiFetch } from "@/shared/api/client";

export type OcrLineItem = {
  name_raw: string;
  quantity: number;
  unit: "unit" | "pack";
  unit_label: string;
  pack_size: number | null;
  unit_price: number;
  line_total: number;
  verified: boolean;
  confidence: number;
  matched_product_id: number | null;
  matched_product_name: string | null;
  current_stock: number;
  suggested_price: number;
  match_score: number;
};

export type OcrInvoiceResult = {
  supplier_name: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  currency: string;
  printed_total: number | null;
  calculated_total: number;
  lines: OcrLineItem[];
  quality: { ok: boolean; message?: string };
  sample?: boolean;
};

export type OcrScanRequest = {
  image?: string;
  currency?: "auto" | "toman" | "rial";
  invoice_type?: "purchase" | "sale";
  sample?: boolean;
};

export async function compressImageForOcr(
  fileOrDataUrl: File | string,
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.85
): Promise<string> {
  let dataUrl = "";
  if (typeof fileOrDataUrl === "string") {
    dataUrl = fileOrDataUrl;
  } else {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(fileOrDataUrl);
    });
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const invoiceOcrService = {
  async processInvoice(payload: OcrScanRequest): Promise<OcrInvoiceResult> {
    return apiFetch<OcrInvoiceResult>("/invoices/ocr", {
      method: "POST",
      json: payload,
    });
  },
};
