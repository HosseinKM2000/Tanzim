import React, { useRef, useState } from "react";
import type { Product } from "@/features/app/inventory/types";
import {
  compressImageForOcr,
  invoiceOcrService,
  type OcrInvoiceResult,
  type OcrLineItem,
} from "../invoice-ocr.service";
import { Button } from "@/shared/ui/button/button";
import { Badge, Box, Dialog, Flex, Heading, IconButton, Text } from "@radix-ui/themes";
import {
  AlertCircle,
  Camera,
  Check,
  Coins,
  FileText,
  HelpCircle,
  Minus,
  Plus,
  RefreshCw,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

interface InvoiceOcrScannerModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  invoiceType: "purchase" | "sale";
  onApplyToInvoice: (data: {
    counterparty?: string;
    title?: string;
    lines: Array<{
      productId: string;
      quantity: string;
      price: string;
      unit: "unit" | "pack";
    }>;
  }) => void;
}

const OCR_STEPS = [
  "بهینه‌سازی نور و کنتراست تصویر فاکتور...",
  "استخراج جدول و خطوط با هوش مصنوعی...",
  "تشخیص اقلام، تعداد و قیمت‌های جزء...",
  "بررسی تراز ریاضی اقلام و جمع کل...",
  "تطبیق هوشمند با کالاهای انبار تنظیم...",
];

export function InvoiceOcrScannerModal({
  open,
  onClose,
  products,
  invoiceType,
  onApplyToInvoice,
}: InvoiceOcrScannerModalProps) {
  const [phase, setPhase] = useState<"upload" | "processing" | "review">("upload");
  const [currency, setCurrency] = useState<"auto" | "toman" | "rial">("auto");
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrInvoiceResult | null>(null);
  const [reviewLines, setReviewLines] = useState<OcrLineItem[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [showTips, setShowTips] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const numberFormatter = new Intl.NumberFormat("fa-IR");
  const formatToman = (val: number) => `${numberFormatter.format(Math.round(val))} تومان`;

  const resetState = () => {
    setPhase("upload");
    setStepIndex(0);
    setError(null);
    setOcrResult(null);
    setReviewLines([]);
    setSupplierName("");
  };

  const handleClose = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    resetState();
    onClose();
  };

  const startOcrProcessing = async (imageSrc?: string, isSample = false) => {
    setError(null);
    setPhase("processing");
    setStepIndex(0);

    // Simulate step progress while request runs
    progressTimerRef.current = setInterval(() => {
      setStepIndex((curr) => Math.min(curr + 1, OCR_STEPS.length - 1));
    }, 900);

    try {
      let finalImg = imageSrc;
      if (imageSrc && !isSample) {
        finalImg = await compressImageForOcr(imageSrc);
      }

      const result = await invoiceOcrService.processInvoice({
        image: finalImg,
        currency,
        invoice_type: invoiceType,
        sample: isSample,
      });

      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setStepIndex(OCR_STEPS.length - 1);

      if (!result.quality?.ok || !result.lines || result.lines.length === 0) {
        throw new Error(result.quality?.message || "جدول اقلام فاکتور یافت نشد. لطفاً عکس واضح‌تری ارسال فرمایید.");
      }

      setOcrResult(result);
      setReviewLines(result.lines);
      setSupplierName(result.supplier_name || "");
      setPhase("review");
    } catch (err: unknown) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      const msg = err instanceof Error ? err.message : "خطا در پردازش تصویر فاکتور. لطفاً مجدداً تلاش کنید.";
      setError(msg);
      setPhase("upload");
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageForOcr(file);
      await startOcrProcessing(compressed, false);
    } catch {
      setError("خواندن فایل با خطا مواجه شد. لطفاً فرمت JPG یا PNG انتخاب کنید.");
    }
    if (e.target) e.target.value = "";
  };

  const updateLineProduct = (index: number, productIdStr: string) => {
    const pId = Number(productIdStr) || null;
    const targetProduct = products.find((p) => p.id === pId);
    setReviewLines((curr) =>
      curr.map((line, i) => {
        if (i !== index) return line;
        const suggested =
          invoiceType === "purchase"
            ? targetProduct?.purchase_price ?? targetProduct?.sale_price
            : targetProduct?.sale_price ?? targetProduct?.purchase_price;
        return {
          ...line,
          matched_product_id: pId,
          matched_product_name:
            targetProduct?.custom_label ||
            targetProduct?.catalog_product?.name ||
            (pId ? `محصول ${pId}` : null),
          suggested_price: suggested || line.unit_price,
          unit_price: suggested && line.unit_price === 0 ? suggested : line.unit_price,
          line_total:
            suggested && line.unit_price === 0
              ? line.quantity * suggested
              : line.line_total,
          match_score: pId ? 1.0 : 0.0,
        };
      })
    );
  };

  const updateLineQty = (index: number, qtyDelta: number) => {
    setReviewLines((curr) =>
      curr.map((line, i) => {
        if (i !== index) return line;
        const newQty = Math.max(1, line.quantity + qtyDelta);
        const newTotal = newQty * line.unit_price;
        return {
          ...line,
          quantity: newQty,
          line_total: newTotal,
          verified: true,
        };
      })
    );
  };

  const updateLinePrice = (index: number, priceStr: string) => {
    const cleanPrice = Number(priceStr.replace(/[^\d]/g, "")) || 0;
    setReviewLines((curr) =>
      curr.map((line, i) => {
        if (i !== index) return line;
        return {
          ...line,
          unit_price: cleanPrice,
          line_total: line.quantity * cleanPrice,
          verified: true,
        };
      })
    );
  };

  const removeLine = (index: number) => {
    setReviewLines((curr) => curr.filter((_, i) => i !== index));
  };

  const applyReviewToInvoice = () => {
    const validLines = reviewLines
      .filter((l) => l.matched_product_id != null)
      .map((l) => ({
        productId: String(l.matched_product_id),
        quantity: String(l.quantity),
        price: String(l.unit_price),
        unit: l.unit,
      }));

    if (validLines.length === 0) {
      setError("حداقل یک ردیف باید به یکی از کالاهای موجود در انبار متصل باشد.");
      return;
    }

    const titlePrefix = invoiceType === "purchase" ? "فاکتور خرید" : "فاکتور فروش";
    const invoiceTitle = ocrResult?.invoice_no
      ? `${titlePrefix} شماره ${ocrResult.invoice_no}`
      : `${titlePrefix} تصویری هوشمند`;

    onApplyToInvoice({
      counterparty: supplierName.trim() || undefined,
      title: invoiceTitle,
      lines: validLines,
    });

    handleClose();
  };

  const totalSum = reviewLines.reduce((acc, l) => acc + l.line_total, 0);

  return (
    <Dialog.Root open={open} onOpenChange={(val) => (!val ? handleClose() : null)}>
      <Dialog.Content maxWidth="780px" style={{ padding: "24px", borderRadius: "20px" }}>
        {/* Header */}
        <Flex justify="between" align="center" mb="4" pb="3" style={{ borderBottom: "1px solid var(--gray-4)" }}>
          <Flex align="center" gap="3">
            <Box
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                padding: "10px",
                borderRadius: "14px",
                color: "#ffffff",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)",
              }}
            >
              <Sparkles size={22} />
            </Box>
            <Box>
              <Heading size="4" weight="bold">
                اسکن هوشمند فاکتور با هوش مصنوعی (OCR)
              </Heading>
              <Text size="2" color="gray">
                {invoiceType === "purchase" ? "خواندن خودکار بیجک و فاکتور خرید" : "خواندن خودکار فاکتور فروش"} · سازگار با دست‌خط و پرینت
              </Text>
            </Box>
          </Flex>
          <IconButton variant="ghost" color="gray" onClick={handleClose} aria-label="بستن">
            <X size={20} />
          </IconButton>
        </Flex>

        {/* Error Alert */}
        {error && (
          <Box
            mb="4"
            p="3"
            style={{
              backgroundColor: "var(--red-3)",
              border: "1px solid var(--red-6)",
              borderRadius: "12px",
            }}
          >
            <Flex align="center" gap="2">
              <AlertCircle size={18} color="var(--red-9)" />
              <Text size="2" weight="medium" color="red">
                {error}
              </Text>
            </Flex>
          </Box>
        )}

        {/* PHASE 1: Upload / Capture */}
        {phase === "upload" && (
          <Box>
            <Flex direction="column" gap="4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleFileChosen}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={handleFileChosen}
              />

              {/* Upload Drop Zone */}
              <Box
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: "2px dashed var(--gray-6)",
                  borderRadius: "18px",
                  padding: "36px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  backgroundColor: "var(--gray-2)",
                  transition: "all 0.2s ease",
                }}
              >
                <Flex direction="column" align="center" gap="3">
                  <Box
                    style={{
                      background: "var(--gray-4)",
                      padding: "16px",
                      borderRadius: "50%",
                      color: "var(--gray-11)",
                    }}
                  >
                    <Upload size={32} />
                  </Box>
                  <Heading size="3" weight="bold">
                    انتخاب عکس فاکتور یا رها کردن اینجا
                  </Heading>
                  <Text size="2" color="gray">
                    پشتیبانی از فرمت‌های JPEG، PNG و WebP (تا حجم ۱۰ مگابایت)
                  </Text>
                </Flex>
              </Box>

              {/* Action Buttons: Camera & Sample */}
              <Flex gap="3" wrap="wrap">
                <Button
                  onClick={() => cameraInputRef.current?.click()}
                  style={{ flex: 1, padding: "14px", height: "auto" }}
                >
                  <Camera size={18} style={{ marginInlineEnd: "8px" }} />
                  عکس گرفتن با دوربین گوشی / وبکم
                </Button>
                <Button
                  variant="soft"
                  onClick={() => startOcrProcessing(undefined, true)}
                  style={{ padding: "14px", height: "auto" }}
                >
                  <FileText size={18} style={{ marginInlineEnd: "8px" }} />
                  تست سریع با فاکتور نمونه
                </Button>
              </Flex>

              {/* Currency & OCR Options */}
              <Flex
                align="center"
                justify="between"
                p="3"
                style={{
                  backgroundColor: "var(--gray-3)",
                  borderRadius: "14px",
                }}
              >
                <Flex align="center" gap="2">
                  <Coins size={18} color="var(--gray-10)" />
                  <Text size="2" weight="medium">
                    واحد پول فاکتور:
                  </Text>
                </Flex>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "auto" | "toman" | "rial")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--gray-6)",
                    backgroundColor: "var(--color-surface)",
                    fontSize: "13px",
                    fontFamily: "inherit",
                  }}
                >
                  <option value="auto">تشخیص خودکار هوشمند (پیش‌فرض)</option>
                  <option value="toman">تومان (بدون تغییر)</option>
                  <option value="rial">ریال (تبدیل به تومان / ۱۰)</option>
                </select>
              </Flex>

              {/* Photo tips toggle */}
              <Box>
                <button
                  type="button"
                  onClick={() => setShowTips((prev) => !prev)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--emerald-9)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <HelpCircle size={15} />
                  {showTips ? "پنهان‌سازی نکات تصویربرداری" : "مشاهده راهنمای گرفتن بهترین عکس از فاکتور"}
                </button>

                {showTips && (
                  <Box
                    mt="3"
                    p="3"
                    style={{
                      backgroundColor: "var(--emerald-2)",
                      border: "1px solid var(--emerald-4)",
                      borderRadius: "14px",
                      fontSize: "13px",
                      lineHeight: "24px",
                      color: "var(--emerald-11)",
                    }}
                  >
                    <ul style={{ margin: 0, paddingInlineStart: "20px" }}>
                      <li><strong>زاویه ۹۰ درجه عمود:</strong> گوشی را کج نگیرید تا جدول فاکتور ذوزنقه‌ای نشود.</li>
                      <li><strong>نور کافی و بدون سایه:</strong> نور از روبرو بتابد تا سایه دست روی ستون قیمت نیفتد.</li>
                      <li><strong>فاکتورهای بازاری و دست‌نویس:</strong> علائم بازاری مانند -/۸۵ (۸۵ هزار تومان) خودکار شناسایی می‌شوند.</li>
                    </ul>
                  </Box>
                )}
              </Box>
            </Flex>
          </Box>
        )}

        {/* PHASE 2: Processing Animation */}
        {phase === "processing" && (
          <Box py="6" style={{ textAlign: "center" }}>
            <Flex direction="column" align="center" gap="4">
              <Box
                style={{
                  position: "relative",
                  width: "90px",
                  height: "90px",
                  margin: "0 auto",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "24px",
                  background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
                  boxShadow: "0 8px 24px rgba(16, 185, 129, 0.2)",
                }}
              >
                <ScanLine size={46} color="#059669" className="animate-pulse" />
              </Box>

              <Box>
                <Heading size="3" weight="bold" mb="1">
                  در حال استخراج هوشمند اقلام فاکتور...
                </Heading>
                <Text size="2" color="gray">
                  {OCR_STEPS[stepIndex]}
                </Text>
              </Box>

              {/* Step indicator pills */}
              <Flex gap="1.5" justify="center" mt="2">
                {OCR_STEPS.map((_, idx) => (
                  <Box
                    key={idx}
                    style={{
                      width: idx <= stepIndex ? "28px" : "10px",
                      height: "6px",
                      borderRadius: "3px",
                      backgroundColor: idx <= stepIndex ? "#10b981" : "var(--gray-5)",
                      transition: "all 0.3s ease",
                    }}
                  />
                ))}
              </Flex>
            </Flex>
          </Box>
        )}

        {/* PHASE 3: Review & Product Mapping */}
        {phase === "review" && (
          <Box>
            <Flex direction="column" gap="4">
              {/* Metadata strip */}
              <Box
                p="3"
                style={{
                  backgroundColor: "var(--gray-3)",
                  borderRadius: "14px",
                  border: "1px solid var(--gray-4)",
                }}
              >
                <Flex justify="between" align="center" wrap="wrap" gap="2">
                  <Flex align="center" gap="2">
                    <Text size="2" color="gray">
                      طرف حساب / فروشنده:
                    </Text>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="نام تأمین‌کننده یا مشتری"
                      style={{
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "1px solid var(--gray-6)",
                        fontSize: "13px",
                        fontFamily: "inherit",
                        fontWeight: 600,
                      }}
                    />
                  </Flex>
                  {ocrResult?.invoice_no && (
                    <Badge color="gray" size="2">
                      شماره: {ocrResult.invoice_no}
                    </Badge>
                  )}
                  {ocrResult?.invoice_date && (
                    <Badge color="gray" size="2">
                      تاریخ: {ocrResult.invoice_date}
                    </Badge>
                  )}
                  <Badge color="green" size="2">
                    {numberFormatter.format(reviewLines.length)} قلم شناسایی‌شده
                  </Badge>
                </Flex>
              </Box>

              {/* Items Table */}
              <Box
                style={{
                  maxHeight: "360px",
                  overflowY: "auto",
                  border: "1px solid var(--gray-4)",
                  borderRadius: "14px",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--gray-2)", borderBottom: "1px solid var(--gray-4)", textAlign: "start" }}>
                      <th style={{ padding: "10px", width: "35px" }}>#</th>
                      <th style={{ padding: "10px" }}>شرح خوانده‌شده / کالا در انبار</th>
                      <th style={{ padding: "10px", width: "110px", textAlign: "center" }}>تعداد</th>
                      <th style={{ padding: "10px", width: "125px", textAlign: "end" }}>قیمت واحد</th>
                      <th style={{ padding: "10px", width: "125px", textAlign: "end" }}>جمع ردیف</th>
                      <th style={{ padding: "10px", width: "40px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewLines.map((line, idx) => {
                      const isMatched = line.matched_product_id != null;
                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: "1px solid var(--gray-3)",
                            backgroundColor: !isMatched ? "rgba(245, 158, 11, 0.05)" : undefined,
                          }}
                        >
                          {/* Row # */}
                          <td style={{ padding: "10px", color: "var(--gray-9)" }}>
                            {numberFormatter.format(idx + 1)}
                          </td>

                          {/* Item & Matching Selector */}
                          <td style={{ padding: "10px" }}>
                            <Text size="2" weight="bold" style={{ display: "block", marginBottom: "4px" }}>
                              {line.name_raw}
                            </Text>
                            <select
                              value={line.matched_product_id ? String(line.matched_product_id) : ""}
                              onChange={(e) => updateLineProduct(idx, e.target.value)}
                              style={{
                                width: "100%",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                border: isMatched ? "1px solid var(--emerald-7)" : "1px solid var(--amber-7)",
                                backgroundColor: isMatched ? "var(--emerald-2)" : "var(--amber-2)",
                                fontSize: "12px",
                                fontFamily: "inherit",
                              }}
                            >
                              <option value="">-- انتخاب کالای متناظر در انبار --</option>
                              {products.map((p) => {
                                const pName = p.custom_label || p.catalog_product?.name || `محصول ${p.id}`;
                                const brandInfo = p.catalog_product?.brand ? ` (${p.catalog_product.brand})` : "";
                                return (
                                  <option key={p.id} value={String(p.id)}>
                                    {pName} {brandInfo}
                                  </option>
                                );
                              })}
                            </select>
                          </td>

                          {/* Quantity Controls */}
                          <td style={{ padding: "10px", textAlign: "center" }}>
                            <Flex align="center" justify="center" gap="1">
                              <IconButton
                                size="1"
                                variant="soft"
                                onClick={() => updateLineQty(idx, -1)}
                                aria-label="کاهش"
                              >
                                <Minus size={12} />
                              </IconButton>
                              <Text size="2" weight="bold" style={{ minWidth: "24px", textAlign: "center" }}>
                                {numberFormatter.format(line.quantity)}
                              </Text>
                              <IconButton
                                size="1"
                                variant="soft"
                                onClick={() => updateLineQty(idx, 1)}
                                aria-label="افزایش"
                              >
                                <Plus size={12} />
                              </IconButton>
                            </Flex>
                          </td>

                          {/* Unit Price */}
                          <td style={{ padding: "10px", textAlign: "end" }}>
                            <input
                              type="text"
                              value={numberFormatter.format(line.unit_price)}
                              onChange={(e) => updateLinePrice(idx, e.target.value)}
                              style={{
                                width: "95px",
                                textAlign: "end",
                                padding: "4px 6px",
                                borderRadius: "6px",
                                border: "1px solid var(--gray-6)",
                                fontSize: "12px",
                                fontFamily: "inherit",
                                fontWeight: 600,
                              }}
                            />
                            {line.verified && (
                              <Text size="1" color="green" style={{ display: "block", marginTop: "2px" }}>
                                ✓ تراز ریاضی
                              </Text>
                            )}
                          </td>

                          {/* Line Total */}
                          <td style={{ padding: "10px", textAlign: "end", fontWeight: 700 }}>
                            {formatToman(line.line_total)}
                          </td>

                          {/* Remove Row */}
                          <td style={{ padding: "10px", textAlign: "center" }}>
                            <IconButton
                              size="1"
                              variant="ghost"
                              color="red"
                              onClick={() => removeLine(idx)}
                              aria-label="حذف ردیف"
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Box>

              {/* Total & Action Bar */}
              <Flex justify="between" align="center" pt="2" style={{ borderTop: "1px solid var(--gray-4)" }}>
                <Box>
                  <Text size="2" color="gray">
                    مجموع فاکتور ({numberFormatter.format(reviewLines.length)} قلم):
                  </Text>
                  <Heading size="4" weight="bold" style={{ color: "#059669" }}>
                    {formatToman(totalSum)}
                  </Heading>
                </Box>
                <Flex gap="2">
                  <Button variant="soft" onClick={() => setPhase("upload")}>
                    <RefreshCw size={15} style={{ marginInlineEnd: "6px" }} />
                    اسکن عکس دیگر
                  </Button>
                  <Button onClick={applyReviewToInvoice}>
                    <Check size={16} style={{ marginInlineEnd: "6px" }} />
                    اعمال روی فاکتور تنظیم
                  </Button>
                </Flex>
              </Flex>
            </Flex>
          </Box>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
