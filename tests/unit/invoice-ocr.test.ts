import { describe, expect, it, vi } from "vitest";
import { invoiceOcrService } from "@/features/invoices/invoice-ocr.service";
import * as apiClient from "@/shared/api/client";

describe("Invoice OCR Service", () => {
  it("calls /invoices/ocr with proper payload and returns parsed invoice result", async () => {
    const mockResponse = {
      supplier_name: "پخش پیشرو",
      invoice_no: "1050",
      invoice_date: "1405/08/25",
      currency: "toman",
      printed_total: 1500000,
      calculated_total: 1500000,
      lines: [
        {
          name_raw: "لنت ترمز پراید",
          quantity: 2,
          unit: "unit" as const,
          unit_label: "دست",
          pack_size: 1,
          unit_price: 750000,
          line_total: 1500000,
          verified: true,
          confidence: 0.98,
          matched_product_id: 10,
          matched_product_name: "لنت ترمز جلو پراید",
          current_stock: 5,
          suggested_price: 720000,
          match_score: 0.95,
        },
      ],
      quality: { ok: true, message: "فاکتور با موفقیت خوانده شد" },
    };

    const spy = vi.spyOn(apiClient, "apiFetch").mockResolvedValueOnce(mockResponse);

    const result = await invoiceOcrService.processInvoice({
      sample: true,
      currency: "toman",
      invoice_type: "purchase",
    });

    expect(spy).toHaveBeenCalledWith("/invoices/ocr", {
      method: "POST",
      json: {
        sample: true,
        currency: "toman",
        invoice_type: "purchase",
      },
    });

    expect(result.quality.ok).toBe(true);
    expect(result.supplier_name).toBe("پخش پیشرو");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].matched_product_id).toBe(10);
    expect(result.lines[0].verified).toBe(true);
  });
});
