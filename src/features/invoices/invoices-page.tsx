import productPlaceholder from "@/assets/product-placeholder.svg";
import { MAX_PRODUCT_QUANTITY } from "@/features/app/inventory/domain/inventory-quantity";
import { inventoryRepository } from "@/features/app/inventory/services/inventory.repository";
import type { Product } from "@/features/app/inventory/types";
import { BarcodeCaptureField } from "@/features/barcode/components/barcode-capture-field";
import { counterpartiesApi, counterpartyKeys } from "@/features/counterparties/api";
import { accessState } from "@/shared/access/access-state";
import { useEntitlementAccess } from "@/shared/access/use-entitlement";
import { formatJalaliDateTime } from "@/shared/lib/date/jalali";
import { useResolvedImage } from "@/shared/lib/infrastructure/media/useImage";
import { useOnline } from "@/shared/lib/infrastructure/sync/use-sync-status";
import { diagnosticErrorCode, userErrorMessage } from "@/shared/lib/presentation/user-error";
import { Button } from "@/shared/ui/button/button";
import { ConfirmDialog } from "@/shared/ui/dialog/confirm-dialog";
import { Form } from "@/shared/ui/form/form";
import { CheckIcon, CubeIcon, FileTextIcon, MinusIcon, PlusIcon, ReaderIcon, Share2Icon, TrashIcon } from "@radix-ui/react-icons";
import { Badge, Box, Card, Dialog, Flex, Heading, IconButton, Text } from "@radix-ui/themes";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Calculator, CalendarDays, Check, CircleAlert, Clock3, Coins, Database, FileDown, Layers3, Package, Printer, Save, ScanLine, Settings2, Share2, ShoppingCart, Trash2, UserRound, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { lookupInvoiceBarcode } from "./invoice-barcode-selection";
import { sanitizeScannedValue } from "@/features/barcode/domain/barcode";
import { refreshInvoiceHistory } from "./invoice-history";
import { invoiceOutput } from "./invoice-output";
import { invoiceRepository } from "./invoice-repository";
import { invoiceService } from "./invoice-service";
import { InvoiceOcrScannerModal } from "./components/invoice-ocr-scanner-modal";
import type { Invoice, InvoiceCommandLine } from "./types";

type DraftLine = { productId: string; quantity: string; price: string; unit: "unit" | "pack" };
const emptyLine = (): DraftLine => ({ productId: "", quantity: "1", price: "", unit: "unit" });
const number = (value: number) => new Intl.NumberFormat("fa-IR").format(value);
const toman = (value: number | null) => value == null ? "قابل مشاهده نیست" : `${number(value)} تومان`;
const canUseInvoiceOutput = (invoice: Invoice) => accessState.canUse(`invoices.${invoice.invoice_type}`)
  && accessState.hasStorePermission(invoice.invoice_type === "purchase" ? "products.purchase_price.view" : "products.sale_price.view")
  && (invoice.status === "accepted" || invoice.status === "cancelled" || (invoice.status === "pending" && accessState.user()?.store_operating_mode === "solo"));

const INVOICE_STATUS_META = {
  accepted: { label: "تأییدشده", icon: Check },
  cancelled: { label: "باطل‌شده", icon: X },
  pending: { label: "ذخیره‌شده", icon: Clock3 },
  cancel_pending: { label: "لغو در انتظار", icon: Clock3 },
  rejected: { label: "پذیرفته‌نشده", icon: CircleAlert },
  conflict: { label: "نیازمند بررسی", icon: CircleAlert },
} as const;

function InvoiceProductThumb({ product }: { product?: Product }) {
  const imagePath = product?.image_url?.startsWith("local://")
    ? product.image_url
    : product?.media_preview_url ?? product?.image_url ?? product?.catalog_product?.image_url ?? null;
  const resolved = useResolvedImage(imagePath);
  const name = product?.custom_label?.trim() || product?.catalog_product?.name?.trim() || "محصول";
  return <img className="invoice-product-thumb" src={resolved.src ?? productPlaceholder} alt={imagePath ? name : ""} />;
}

export function InvoicesPage() {
  const access = useEntitlementAccess();
  const online = useOnline();
  const canPost = accessState.hasStorePermission("invoices.post");
  const canPurchase = !access.requiresOnlineVerification && accessState.canUse("invoices.purchase") && canPost && accessState.hasStorePermission("products.purchase_price.view");
  const canSale = !access.requiresOnlineVerification && accessState.canUse("invoices.sale") && canPost;
  const parties = useQuery({
    queryKey: counterpartyKeys.all,
    queryFn: counterpartiesApi.list,
    enabled: online && accessState.hasStorePermission("counterparties.view"),
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedType, setSelectedType] = useState<"purchase" | "sale" | null>(null);
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outputBusy, setOutputBusy] = useState<number | null>(null);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [successInvoice, setSuccessInvoice] = useState<Invoice | null>(null);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const lastScan = useRef({ value: "", at: 0 });

  const type = selectedType === "sale" && canSale
    ? "sale"
    : selectedType === "purchase" && canPurchase
      ? "purchase"
      : canSale ? "sale" : "purchase";

  const load = async () => {
    try { await refreshInvoiceHistory(); } catch { /* local history remains available */ }
    const [storedProducts, storedInvoices] = await Promise.all([inventoryRepository.getAll(), invoiceRepository.getAll()]);
    setProducts(storedProducts.filter((item) => !item.deleted_at && !item.is_hidden));
    setInvoices(storedInvoices);
  };
  useEffect(() => {
    let active = true;
    void refreshInvoiceHistory().catch(() => undefined)
      .then(() => Promise.all([inventoryRepository.getAll(), invoiceRepository.getAll()]))
      .then(([storedProducts, storedInvoices]) => {
        if (!active) return;
        setProducts(storedProducts.filter((item) => !item.deleted_at && !item.is_hidden));
        setInvoices(storedInvoices);
      });
    return () => { active = false; };
  }, [access.requiresOnlineVerification]);

  const total = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.price) || 0), 0), [lines]);
  const totalItems = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0), [lines]);
  const completedLines = lines.filter((line) => line.productId && Number(line.quantity) > 0 && line.price !== "").length;
  const dirty = Boolean(title || counterparty || barcode || lines.some((line) => line.productId || line.price || line.quantity !== "1"));

  const updateLine = (index: number, patch: Partial<DraftLine>) => setLines((current) => current.map((line, position) => position === index ? { ...line, ...patch } : line));
  const selectProduct = (index: number, value: string) => {
    const product = products.find((item) => item.id === Number(value));
    const suggested = type === "purchase" ? product?.purchase_price : product?.sale_price;
    updateLine(index, { productId: value, price: suggested == null ? "" : String(suggested), unit: "unit" });
  };
  const changeQuantity = (index: number, delta: number) => updateLine(index, { quantity: String(Math.min(MAX_PRODUCT_QUANTITY, Math.max(1, (Number(lines[index].quantity) || 1) + delta))) });
  const setInvoiceType = (next: "purchase" | "sale") => {
    setSelectedType(next);
    setLines((current) => current.map((line) => ({
      ...line,
      price: products.find((item) => item.id === Number(line.productId))?.[next === "purchase" ? "purchase_price" : "sale_price"]?.toString() ?? "",
    })));
  };
  const chooseCounterparty = (value: string) => {
    setCounterparty(value);
    const matches = (parties.data ?? []).filter((item) => item.name === value);
    setCounterpartyId(matches.length === 1 ? matches[0].id : null);
  };
  const buildPayload = (): InvoiceCommandLine[] => lines.map((line) => {
    const product = products.find((item) => item.id === Number(line.productId));
    return {
      product_id: Number(line.productId),
      quantity: Number(line.quantity),
      unit: line.unit,
      pack_size: line.unit === "pack" ? product?.catalog_product?.pack_size ?? null : null,
      unit_price: line.price === "" ? Number.NaN : Number(line.price),
    };
  });

  const findBarcode = async (scanned = barcode) => {
    const normalized = sanitizeScannedValue(scanned);
    if (!normalized) return;
    const now = Date.now();
    if (lastScan.current.value === normalized && now - lastScan.current.at < 1200) return;
    lastScan.current = { value: normalized, at: now };
    try {
      const result = await lookupInvoiceBarcode(normalized, products, type);
      if (result.kind === "unknown") throw new Error("محصولی با این بارکد پیدا نشد");
      if (result.kind === "ambiguous") throw new Error("این بارکد چند محصول دارد؛ محصول را دستی انتخاب کنید.");
      if (result.kind === "retired") throw new Error("این بارکد بازنشسته شده و نمی‌تواند ردیف فاکتور را انتخاب کند.");
      const existing = lines.findIndex((line) => Number(line.productId) === result.product.id);
      const empty = lines.findIndex((line) => !line.productId);
      const target = existing >= 0 ? existing : empty >= 0 ? empty : lines.length;
      if (existing < 0 && empty < 0) setLines((current) => [...current, emptyLine()]);
      if (existing < 0) setTimeout(() => selectProduct(target, String(result.product.id)), 0);
      setHighlightedLine(target); setTimeout(() => setHighlightedLine(null), 1600);
      setBarcode(normalized); setError(null); setErrorCode(null);
    } catch (cause) {
      setError(userErrorMessage(cause, "خواندن بارکد انجام نشد."));
      setErrorCode(diagnosticErrorCode(cause));
    }
  };

  const commit = async () => {
    setBusy(true); setError(null); setErrorCode(null);
    try {
      const invoice = await invoiceService.post({ invoice_type: type, title, counterparty_id: counterpartyId, counterparty, lines: buildPayload() });
      setReviewOpen(false); setSuccessInvoice(invoice);
      setTitle(""); setCounterparty(""); setCounterpartyId(null); setLines([emptyLine()]); setBarcode("");
      await load();
    } catch (cause) {
      setReviewOpen(false);
      setError(userErrorMessage(cause, "ثبت فاکتور انجام نشد."));
      setErrorCode(diagnosticErrorCode(cause));
    } finally { setBusy(false); }
  };
  const runOutput = async (invoice: Invoice, action: "download" | "print" | "share") => {
    setOutputBusy(invoice.id); setError(null); setErrorCode(null);
    try { await invoiceOutput[action](invoice); }
    catch (cause) { setError(userErrorMessage(cause, "ساخت سند انجام نشد.")); setErrorCode(diagnosticErrorCode(cause)); }
    finally { setOutputBusy(null); }
  };

  const resetDraft = () => {
    setSelectedType(null);
    setTitle(""); setCounterparty(""); setCounterpartyId(null); setLines([emptyLine()]); setBarcode("");
    setError(null); setErrorCode(null);
  };
  const saveDraft = () => {
    const actor = accessState.user();
    if (!actor) return;
    localStorage.setItem(`invoice-draft:${actor.id}:${actor.store_id}`, JSON.stringify({ type, title, counterparty, counterpartyId, lines }));
  };

  const handleApplyOcrData = (data: {
    counterparty?: string;
    title?: string;
    lines: Array<{
      productId: string;
      quantity: string;
      price: string;
      unit: "unit" | "pack";
    }>;
  }) => {
    if (data.counterparty) setCounterparty(data.counterparty);
    if (data.title) setTitle(data.title);
    if (data.lines && data.lines.length > 0) setLines(data.lines);
    setError(null);
    setErrorCode(null);
  };

  return <Box dir="rtl" className="invoice-page mx-auto w-full">
    <Heading as="h1" className="invoice-page-title">فاکتورها</Heading>
    {!canPurchase && !canSale ? <Card><Heading size="4">فاکتورهای تاریخی</Heading><Text as="p" mt="2">ثبت فاکتور در طرح یا نقش فعلی فعال نیست؛ سوابق قبلی برای مشاهده باقی می‌مانند.</Text></Card> : (
      <Form onSubmit={(event) => { event.preventDefault(); setReviewOpen(true); }} isSubmitting={busy} isDirty={dirty} className="invoice-create-layout">
        <main className="invoice-editor">
          <Card size="3" className="invoice-panel invoice-basics">
            <div className="invoice-basic-field invoice-type-field">
              <span className="invoice-field-label"><Package /> نوع فاکتور</span>
              <div className="invoice-type-switch" role="group" aria-label="نوع فاکتور">
                <button type="button" data-active={type === "sale"} disabled={!canSale} onClick={() => setInvoiceType("sale")}><ShoppingCart />فروش</button>
                <button type="button" data-active={type === "purchase"} disabled={!canPurchase} onClick={() => setInvoiceType("purchase")}><CubeIcon />خرید</button>
              </div>
            </div>
            <label className="invoice-basic-field"><span className="invoice-field-label"><FileTextIcon /> عنوان فاکتور <b>*</b></span><input aria-label="عنوان فاکتور" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} placeholder={type === "sale" ? "مثلاً فروش حضوری" : "مثلاً خرید روزانه"}/></label>
            <label className="invoice-basic-field"><span className="invoice-field-label"><UserRound /> طرف حساب <small>(اختیاری)</small></span><input aria-label="طرف حساب" list="invoice-counterparties" value={counterparty} onChange={(event) => chooseCounterparty(event.target.value)} maxLength={200} placeholder="نام را بنویسید یا انتخاب کنید"/><datalist id="invoice-counterparties">{(parties.data ?? []).map((item) => <option key={item.id} value={item.name}>{item.phone ?? (item.kind === "organization" ? "مجموعه" : "فرد")}</option>)}</datalist></label>
          </Card>

          <Card size="3" className="invoice-panel invoice-products-panel">
            <div className="invoice-products-heading"><Heading size="5"><Boxes /> کالاهای فاکتور</Heading><Badge color="violet" size="2"><CubeIcon /><span className="invoice-count-desktop">{number(lines.length)} قلم کالا</span><span className="invoice-count-mobile">{number(lines.length)} ردیف</span></Badge></div>
            <div className="invoice-products-toolbar">
              {accessState.canUse("barcode.lookup") && accessState.hasStorePermission("barcodes.lookup") ? <div className="invoice-product-search"><BarcodeCaptureField key={`${accessState.user()?.id}:${accessState.user()?.store_id}`} value={barcode} onValueChange={setBarcode} onScan={(value) => void findBarcode(value)} placeholder="جست‌وجوی محصول (نام، کد یا بارکد)…"/><Button aria-label="اسکن محصول" type="button" variant="soft" onClick={() => void findBarcode()}><ScanLine /><span className="invoice-scan-desktop">اسکن بارکد</span><span className="invoice-scan-mobile">اسکن</span></Button></div> : null}
              <div className="invoice-table-actions">
                <Button
                  type="button"
                  variant="solid"
                  className="invoice-ocr-action-btn"
                  onClick={() => setOcrModalOpen(true)}
                  style={{
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: "#ffffff",
                    fontWeight: 700,
                    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.25)",
                  }}
                >
                  <Zap /> اسکن هوشمند (OCR)
                </Button>
                <Button type="button" variant="soft" onClick={() => setLines((current) => [...current, emptyLine()])}><PlusIcon /> افزودن ردیف</Button>
                <Button type="button" variant="soft" onClick={() => setLines((current) => [...current, emptyLine()])}><Zap /> افزودن سریع</Button>
                <Button type="button" variant="soft" disabled title="پس از انتخاب چند ردیف فعال می‌شود"><Settings2 /> عملیات گروهی</Button>
              </div>
            </div>
            <div className="invoice-lines-header" aria-hidden="true"><span>ردیف</span><span>محصول</span><span>تعداد</span><span>واحد</span><span>قیمت هر واحد (تومان)</span><span>جمع ردیف (تومان)</span><span /></div>
            <div className="invoice-lines">{lines.map((line, index) => {
              const product = products.find((item) => item.id === Number(line.productId));
              const lineTotal = (Number(line.quantity) || 0) * (Number(line.price) || 0);
              return <article key={index} className="invoice-line" data-highlighted={highlightedLine === index} data-invoice-line={index} tabIndex={-1}>
                <div className="invoice-line-index">{number(index + 1)}</div>
                <label className="invoice-line-product"><span>محصول</span><div className="invoice-product-select"><InvoiceProductThumb product={product}/><div className="invoice-product-choice"><select aria-label={`محصول ردیف ${index + 1}`} value={line.productId} onChange={(event) => selectProduct(index, event.target.value)} required><option value="">انتخاب محصول</option>{products.map((item) => <option key={item.id} value={item.id}>{item.custom_label || item.catalog_product?.name || `#${item.id}`}</option>)}</select>{product ? <small>کد: {number(product.catalog_product_id || product.id)}</small> : null}</div></div></label>
                <label className="invoice-line-quantity"><span>تعداد</span><div className="invoice-stepper"><button type="button" aria-label={`یک واحد بیشتر برای ردیف ${index + 1}`} onClick={() => changeQuantity(index, 1)}><PlusIcon /></button><input aria-label={`تعداد ردیف ${index + 1}`} type="number" min="1" max={MAX_PRODUCT_QUANTITY} step="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })}/><button type="button" aria-label={`یک واحد کمتر برای ردیف ${index + 1}`} onClick={() => changeQuantity(index, -1)}><MinusIcon /></button></div></label>
                <label className="invoice-line-unit"><span>واحد</span><select aria-label={`واحد ردیف ${index + 1}`} value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value as DraftLine["unit"] })}><option value="unit">عدد</option>{product?.catalog_product?.is_packaged ? <option value="pack">بسته</option> : null}</select></label>
                <label className="invoice-line-price"><span>قیمت هر واحد (تومان)</span><div className="invoice-price-control"><Coins /><input aria-label={`قیمت ردیف ${index + 1}`} type="number" min="0" step="1" value={line.price} onChange={(event) => updateLine(index, { price: event.target.value })} required placeholder="وارد کنید…"/></div></label>
                <div className="invoice-line-total"><span>جمع ردیف</span><strong>{toman(lineTotal)}</strong></div>
                <IconButton type="button" color="red" variant="soft" aria-label={`حذف ردیف ${index + 1}`} onClick={() => setLines((current) => current.length === 1 ? [emptyLine()] : current.filter((_, position) => position !== index))}><TrashIcon /></IconButton>
              </article>;
            })}</div>
            <button type="button" className="invoice-add-line" onClick={() => setLines((current) => [...current, emptyLine()])}><PlusIcon /> افزودن ردیف جدید</button>
            <div className="invoice-table-pagination"><span>۲۰ ردیف در هر صفحه</span><div><button type="button">‹</button><button type="button">۲</button><button type="button" data-active="true">۱</button><button type="button">›</button></div></div>
            <div className="invoice-table-totals"><span><Package /> جمع اقلام این صفحه: <b>{number(totalItems)}</b></span><span><Database /> جمع مبلغ این صفحه: <b>{toman(total)}</b></span></div>
          </Card>
        </main>

        <aside className="invoice-summary"><Card size="3" className="invoice-summary-card">
          <Heading size="5"><Calculator /> خلاصه فاکتور</Heading>
          <dl><div><dt><Database /> تعداد ردیف‌ها</dt><dd>{number(lines.length)}</dd></div><div><dt><Package /> تعداد کل اقلام</dt><dd>{number(totalItems)}</dd></div><div className="invoice-summary-total"><dt><Database /> جمع فاکتور</dt><dd>{toman(total)}</dd></div></dl>
          {completedLines !== lines.length ? <div className="invoice-validation-note"><strong>⚠ {number(lines.length - completedLines)} مورد نیاز به تکمیل</strong><span>اطلاعات محصول، تعداد و قیمت ردیف‌های ناقص را بررسی کنید.</span></div> : null}
          <Button type="submit" className="invoice-submit" disabled={!title.trim() || completedLines !== lines.length}><CheckIcon /> بررسی و ثبت قطعی</Button>
          <div className="invoice-summary-actions"><Button type="button" variant="soft" onClick={saveDraft}><Save /> ذخیره برای ادامه بعداً</Button><Button type="button" variant="soft" onClick={() => setReviewOpen(true)}><Printer /> پیش‌نمایش و چاپ</Button><Button type="button" variant="soft" onClick={resetDraft}><X /> انصراف</Button></div>
        </Card></aside>
        {error ? <Box className="invoice-form-error" role="alert"><Text as="p" color="red">{error}</Text>{errorCode ? <details className="sync-diagnostic"><summary>جزئیات برای پشتیبانی</summary><code dir="ltr">{errorCode}</code></details> : null}</Box> : null}
      </Form>
    )}

    <InvoiceHistory invoices={invoices} canOutput={canPurchase || canSale} outputBusy={outputBusy} onOutput={runOutput} onReload={load} onError={(cause) => { setError(userErrorMessage(cause, "لغو فاکتور انجام نشد.")); setErrorCode(diagnosticErrorCode(cause)); }}/>
    <ConfirmDialog open={reviewOpen} onOpenChange={setReviewOpen} title="تأیید ثبت فاکتور" description="پس از ثبت، فاکتور و ردیف‌های آن قابل ویرایش نیستند." confirmLabel="تأیید و ثبت" variant="warning" loading={busy} disabled={!title.trim() || completedLines !== lines.length} details={<div className="invoice-confirm-summary"><span>نوع: <b>{type === "sale" ? "فروش" : "خرید"}</b></span><span>ردیف‌ها: <b>{number(lines.length)}</b></span><span>جمع: <b>{toman(total)}</b></span></div>} onConfirm={() => void commit()}/>
    <Dialog.Root open={successInvoice !== null} onOpenChange={(open) => { if (!open) setSuccessInvoice(null); }}><Dialog.Content dir="rtl" maxWidth="520px" className="invoice-success-dialog"><div className="invoice-success-icon"><CheckIcon /></div><Dialog.Title>فاکتور با موفقیت ثبت شد</Dialog.Title><Dialog.Description>سند آماده دریافت، چاپ یا اشتراک‌گذاری است.</Dialog.Description>{successInvoice ? <><div className="invoice-success-summary"><span>{successInvoice.title}</span><b>{toman(successInvoice.total_amount)}</b></div><Flex gap="2" mt="4" wrap="wrap" justify="center"><Button variant="soft" onClick={() => void runOutput(successInvoice, "download")} loading={outputBusy === successInvoice.id}><FileTextIcon /> PDF</Button><Button variant="soft" onClick={() => void runOutput(successInvoice, "print")}><ReaderIcon /> چاپ</Button><Button variant="soft" onClick={() => void runOutput(successInvoice, "share")}><Share2Icon /> اشتراک</Button></Flex></> : null}<Dialog.Close><Button mt="4" variant="soft" color="gray" className="w-full">بستن</Button></Dialog.Close></Dialog.Content></Dialog.Root>
    <InvoiceOcrScannerModal
      open={ocrModalOpen}
      onClose={() => setOcrModalOpen(false)}
      products={products}
      invoiceType={type}
      onApplyToInvoice={handleApplyOcrData}
    />
  </Box>;
}

function InvoiceHistory({ invoices, canOutput, outputBusy, onOutput, onReload, onError }: {
  invoices: Invoice[];
  canOutput: boolean;
  outputBusy: number | null;
  onOutput: (invoice: Invoice, action: "download" | "print" | "share") => Promise<void>;
  onReload: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  return <section className="invoice-history">
    <div className="invoice-history-heading"><Layers3 /><Heading as="h2" size="5">تاریخچه فاکتورها</Heading></div>
    <div className="invoice-history-grid">{invoices.length ? invoices.map((invoice) => <InvoiceHistoryCard key={invoice.id} invoice={invoice} canOutput={canOutput} outputBusy={outputBusy} onOutput={onOutput} onReload={onReload} onError={onError} />) : <div className="invoice-history-empty"><FileTextIcon /><strong>هنوز فاکتوری ثبت نشده است</strong><span>فاکتورهای ثبت‌شده در این بخش نمایش داده می‌شوند.</span></div>}</div>
  </section>;
}

function InvoiceHistoryCard({ invoice, canOutput, outputBusy, onOutput, onReload, onError }: {
  invoice: Invoice;
  canOutput: boolean;
  outputBusy: number | null;
  onOutput: (invoice: Invoice, action: "download" | "print" | "share") => Promise<void>;
  onReload: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const access = useEntitlementAccess();
  const status = INVOICE_STATUS_META[invoice.status] ?? { label: "در انتظار", icon: Clock3 };
  const StatusIcon = status.icon;
  const dateTime = formatJalaliDateTime(invoice.posted_at).split(" ");
  const date = dateTime[0] ?? "—";
  const time = dateTime[1] ?? "—";
  const mayOutput = !access.requiresOnlineVerification && canOutput && canUseInvoiceOutput(invoice);
  const mayCancel = !access.requiresOnlineVerification && accessState.hasStorePermission("invoices.cancel")
    && accessState.canUse(`invoices.${invoice.invoice_type}`)
    && !["cancelled", "cancel_pending", "rejected", "conflict"].includes(invoice.status);

  return <article className="invoice-history-card" data-status={invoice.status}>
    <div className="invoice-history-card-main">
      <div className="invoice-history-identity"><strong>{invoice.title}</strong><span><ShoppingCart />{invoice.invoice_type === "purchase" ? "خرید" : "فروش"}</span></div>
      <div className="invoice-history-meta"><span><CalendarDays />{date}<b>{time}</b></span><span><UserRound />طرف حساب: {invoice.counterparty || "بدون طرف حساب"}</span></div>
      <div className="invoice-history-amount"><span><Coins />جمع:</span><strong>{toman(invoice.total_amount)}</strong></div>
      <div className="invoice-history-status"><StatusIcon />{status.label}</div>
    </div>
    {(mayOutput || mayCancel) ? <div className="invoice-history-actions">
      {mayOutput ? <><Button className="invoice-history-download" type="button" loading={outputBusy === invoice.id} onClick={() => void onOutput(invoice, "download")}><FileDown /> دریافت PDF</Button><Button type="button" variant="soft" onClick={() => void onOutput(invoice, "print")}><Printer /> چاپ</Button><Button type="button" variant="soft" onClick={() => void onOutput(invoice, "share")}><Share2 /> اشتراک‌گذاری</Button></> : null}
      {mayCancel ? <Button className="invoice-history-cancel" color="red" variant="soft" onClick={() => void invoiceService.cancel(invoice.id).then(onReload).catch(onError)}><Trash2 /> لغو کامل فاکتور</Button> : null}
    </div> : null}
  </article>;
}
