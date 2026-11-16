import { describe, expect, it } from "vitest";

import {
  barcodeLookupCandidates,
  generateInternalBarcode,
  sanitizeScannedValue,
  validateBarcode,
} from "@/features/barcode/domain/barcode";

describe("barcode identity", () => {
  it("preserves leading zeros, case, spaces, and removes only transport terminators", () => {
    expect(sanitizeScannedValue("\t00Ab c\r\n")).toBe("00Ab c");
    expect(sanitizeScannedValue(" 00Ab c ")).toBe(" 00Ab c ");
  });

  it("validates EAN/UPC checksums instead of accepting numeric lookalikes", () => {
    expect(validateBarcode("4006381333931", "ean13").valid).toBe(true);
    expect(validateBarcode("4006381333932", "ean13").valid).toBe(false);
    expect(validateBarcode("042100005264", "upca").valid).toBe(true);
    expect(validateBarcode("96385074", "ean8").valid).toBe(true);
  });

  it("keeps UPC/EAN equivalence explicit and checksum guarded", () => {
    expect(barcodeLookupCandidates("042100005264", "upca")).toEqual([
      "042100005264",
      "0042100005264",
    ]);
    expect(barcodeLookupCandidates("0042100005264", "ean13")).toEqual([
      "0042100005264",
      "042100005264",
    ]);
    expect(barcodeLookupCandidates("0042100005265", "ean13")).toEqual([
      "0042100005265",
    ]);
  });

  it("generates compact ASCII identifiers and retries local collisions", async () => {
    const sequences = [new Uint8Array(16), new Uint8Array(16).fill(1)];
    const generated = await generateInternalBarcode({
      sectorCode: "01",
      categoryCode: "07",
      randomBytes: () => sequences.shift()!,
      exists: async (value) => value === "TZ1-01-07-00000000000000000000000000",
    });
    expect(generated).toBe("TZ1-01-07-040G2081040G2081040G208104");
    expect(generated).toMatch(/^TZ1-01-07-[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
