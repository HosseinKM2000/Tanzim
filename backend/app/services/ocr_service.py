"""
Tanzim Smart Invoice OCR Service
Extracts structured Persian invoice line items, supplier/buyer details, totals, and
automatically maps items to the store's product inventory.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..models import InventoryItem

logger = logging.getLogger(__name__)

FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"
PERSIAN_TO_LATIN = str.maketrans(
    "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩",
    "01234567890123456789"
)

PERSIAN_CHARS_MAP = str.maketrans({
    "ي": "ی",
    "ك": "ک",
    "ة": "ه",
    "ؤ": "و",
    "إ": "ا",
    "أ": "ا",
    "ء": "",
    "‌": " ",  # zero-width non-joiner to space
})

STOP_WORDS = {
    "تا", "عدد", "دانه", "دونه", "بسته", "کارتن", "جعبه", "دست", "دستگاه",
    "از", "با", "برای", "در", "به", "و", "یک", "دو", "سه", "چهار", "پنج",
    "اصلی", "اورجینال", "شرکتی", "طرح", "مدل", "سایز", "شماره"
}

COLUMN_PATTERNS = {
    "name": re.compile(r"^(?!.*کد)(?=.*(شرح|نام|کالا|محصول|جنس|قطعه|اقلام|خدمات))"),
    "qty": re.compile(r"(تعداد|مقدار|وزن|متراژ|تعداد\s*کارتن|تعداد\s*جزء|تعداد\s*کل)"),
    "unit": re.compile(r"^\s*واحد(\s*(اندازه|سنجش)\S*)?\s*$"),
    "price": re.compile(r"((^|[\s(])فی($|[\s()])|قیمت\s*واحد|بهای\s*واحد|مبلغ\s*واحد|نرخ|فی\s*واحد)"),
    "total": re.compile(
        r"(مبلغ(?!\s*واحد)|جمع(?!\s*کل)|قیمت\s*(کل|کالا|نهایی)|بهای\s*(کل|کالا)|"
        r"ارزش(?:\s*(کل|کالا))?|مبلغ\s*(کل|کالا|نهایی)|بهای\s*خالص|^کل(?:\s|$|\()|^مبلغ(?:\s|$|\()|^قیمت(?:\s|$|\())"
    ),
}

UNIT_LABELS = {
    "unit": "عدد",
    "pack": "بسته",
    "box": "جعبه",
    "carton": "کارتن",
    "set": "دست",
    "device": "دستگاه",
    "meter": "متر",
    "kg": "کیلوگرم",
}

SUPPLIER_PATTERNS = [
    re.compile(r"(?:فروشنده|پخش|شرکت|فروشگاه|تأمین‌کننده|تهیه‌کننده|بازرگانی)\s*[:؛-]?\s*([^\n\r|،,]{3,40})"),
    re.compile(r"(?:توسط|فروشگاه)\s*[:؛-]?\s*([^\n\r|،,]{3,40})"),
]

INVOICE_NO_PATTERNS = [
    re.compile(r"(?:شماره\s*فاکتور|شماره\s*صورتحساب|شماره\s*سفارش|فاکتور\s*شماره|ش\s*فاکتور)\s*[:؛-]?\s*([A-Za-z0-9۰-۹٠-٩_-]+)"),
    re.compile(r"(?:شماره|شماره‌)\s*[:؛-]?\s*([0-9۰-۹٠-٩]{3,15})"),
]

DATE_PATTERNS = [
    re.compile(r"(?:تاریخ|مورخ)\s*[:؛-]?\s*([1-9][0-9۰-۹٠-٩]{3}[/-][0-9۰-۹٠-٩]{1,2}[/-][0-9۰-۹٠-٩]{1,2})"),
    re.compile(r"([1-9][0-9۰-۹٠-٩]{3}[/-][0-9۰-۹٠-٩]{1,2}[/-][0-9۰-۹٠-٩]{1,2})"),
]

TOTAL_PATTERNS = [
    re.compile(r"(?:جمع\s*کل|مبلغ\s*قابل\s*پرداخت|مبلغ\s*کل|مجموع\s*کل|قابل\s*پرداخت|جمع\s*فاکتور)\s*[:؛-]?\s*([0-9۰-۹٠-٩,،/.-]+)"),
]


def latin_digits(text: str) -> str:
    """Converts Persian and Arabic digits to Latin digits."""
    return text.translate(PERSIAN_TO_LATIN)


def normalize_persian_text(text: str) -> str:
    """Standardizes Persian typography, removing Arabic glyph variants and noisy symbols."""
    text = text.translate(PERSIAN_CHARS_MAP)
    text = re.sub(r"[\u200c\u200b\u00a0]+", " ", text)
    # Only normalize horizontal whitespace, preserving newlines
    text = re.sub(r"[^\S\r\n]+", " ", text)
    return text.strip()


def parse_persian_number(token: str) -> float | None:
    """
    Parses accounting numbers in Persian documents:
    - Shorthand thousands notation: '-/85' or '85/-' -> 85000 (three zeroes shorthand)
    - Slash thousand separators: '40/000' -> 40000, '230/000' -> 230000
    - Persian commas/separators: '۱,۵۰۰,۰۰۰' -> 1500000
    """
    if not token or not isinstance(token, str):
        return None
    token = token.strip()
    if not token:
        return None

    # Expand shorthand notation (-/85 -> 85000 or 85/- -> 85000)
    token = re.sub(r"(^|[^\d٠-٩۰-۹])[-—_]\s*[/٫/]\s*([\d٠-٩۰-۹]+)(?=$|[^\d٠-٩۰-۹])", r"\g<1>\g<2>000", token)
    token = re.sub(r"([\d٠-٩۰-۹]+)\s*[/٫/]\s*[-—_](?=$|[^\d٠-٩۰-۹])", r"\g<1>000", token)
    # Slash as thousand separator e.g. 40/000
    token = re.sub(r"([\d٠-٩۰-۹]+)\s*[/⁄]\s*([\d٠-٩۰-۹]{3})(?=$|[\s|])", r"\g<1>\g<2>", token)

    latin = latin_digits(token)
    # Strip non-numeric edges
    latin = re.sub(r"^[^\d.]+|[^\d.]+$", "", latin)
    # Clean commas, slashes, spaces
    clean = re.sub(r"[,٬،'’`\s/]", "", latin).replace("٫", ".")
    # Dots as thousands separators
    if re.match(r"^\d{1,3}(\.\d{3})+$", clean):
        clean = clean.replace(".", "")

    try:
        val = float(clean)
        return val
    except ValueError:
        return None


def _token_similarity(q_tokens: list[str], target_tokens: list[str]) -> float:
    """Computes symmetric token-based similarity between an OCR phrase and catalog title."""
    if not q_tokens or not target_tokens:
        return 0.0
    matches = 0
    for q in q_tokens:
        best = 0.0
        for t in target_tokens:
            if q == t:
                best = 1.0
                break
            if len(q) >= 3 and len(t) >= 3:
                if q in t or t in q:
                    best = max(best, 0.8)
                elif q.startswith(t[:3]) or t.startswith(q[:3]):
                    best = max(best, 0.6)
        matches += best
    return matches / max(len(q_tokens), 1)


def parse_ocr_text(raw_text: str, currency_preference: str = "auto") -> dict[str, Any]:
    """
    Parses OCR raw text / markdown into structured invoice lines and metadata.
    Handles markdown tables, tab-delimited text, or free-form invoice rows.
    """
    cleaned_text = normalize_persian_text(raw_text)
    plain_text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", cleaned_text)
    plain_text = re.sub(r"[*_~`]", "", plain_text)

    # 1. Detect Metadata: Supplier, Invoice No, Date, Currency
    supplier_name: str | None = None
    for pattern in SUPPLIER_PATTERNS:
        match = pattern.search(plain_text)
        if match:
            candidate = match.group(1).strip()
            if candidate and not re.match(r"^(کالا|فاکتور|ردیف|شماره)", candidate):
                supplier_name = candidate
                break

    invoice_no: str | None = None
    for pattern in INVOICE_NO_PATTERNS:
        match = pattern.search(plain_text)
        if match:
            invoice_no = latin_digits(match.group(1).strip())
            break

    invoice_date: str | None = None
    for pattern in DATE_PATTERNS:
        match = pattern.search(plain_text)
        if match:
            invoice_date = latin_digits(match.group(1).strip())
            break

    # Determine currency
    currency = "toman"
    if currency_preference in ("rial", "toman"):
        currency = currency_preference
    elif "ریال" in plain_text or "ريال" in plain_text:
        currency = "rial"

    # 2. Extract printed total
    printed_total: int | None = None
    for pattern in TOTAL_PATTERNS:
        match = pattern.search(plain_text)
        if match:
            val = parse_persian_number(match.group(1))
            if val is not None and val > 0:
                printed_total = int(round(val))
                break

    # 3. Parse Table Rows
    lines: list[dict[str, Any]] = []
    raw_lines = [line.strip() for line in plain_text.splitlines() if line.strip()]

    # Filter table lines (markdown pipe separated)
    table_lines = [l for l in raw_lines if l.count("|") >= 3 and not re.match(r"^[\s|:-]+$", l)]

    col_map: dict[str, int] = {}
    is_table_mode = False

    for line in table_lines:
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not cells:
            continue

        # Check if header line
        is_header = any(COLUMN_PATTERNS["name"].search(c) for c in cells) and (
            any(COLUMN_PATTERNS["qty"].search(c) for c in cells)
            or any(COLUMN_PATTERNS["price"].search(c) for c in cells)
            or any(COLUMN_PATTERNS["total"].search(c) for c in cells)
        )

        if is_header:
            is_table_mode = True
            col_map = {}
            for idx, c in enumerate(cells):
                for col_name, pattern in COLUMN_PATTERNS.items():
                    if pattern.search(c) and col_name not in col_map:
                        col_map[col_name] = idx
            continue

        if is_table_mode and "name" in col_map:
            name_idx = col_map["name"]
            if name_idx >= len(cells):
                continue
            name_raw = cells[name_idx].strip()
            # Drop line numbers or summary lines
            name_raw = re.sub(r"^[\d۰-۹٠-٩]{1,4}[-.)]\s*", "", name_raw).strip()
            if not name_raw or len(name_raw) < 2:
                continue
            if re.search(r"^(جمع|مجموع|تخفیف|قابل\s*پرداخت|مالیات|مانده)", name_raw):
                continue

            # Quantity
            qty = 1.0
            if "qty" in col_map and col_map["qty"] < len(cells):
                parsed_qty = parse_persian_number(cells[col_map["qty"]])
                if parsed_qty is not None and parsed_qty > 0:
                    qty = parsed_qty

            # Unit
            unit_str = "عدد"
            if "unit" in col_map and col_map["unit"] < len(cells):
                u_cand = cells[col_map["unit"]].strip()
                if u_cand:
                    unit_str = u_cand

            # Price
            unit_price: float | None = None
            if "price" in col_map and col_map["price"] < len(cells):
                unit_price = parse_persian_number(cells[col_map["price"]])

            # Total
            line_total: float | None = None
            if "total" in col_map and col_map["total"] < len(cells):
                line_total = parse_persian_number(cells[col_map["total"]])

            # Reconcile price and total
            if unit_price is None and line_total is not None and qty > 0:
                unit_price = line_total / qty
            elif line_total is None and unit_price is not None and qty > 0:
                line_total = unit_price * qty

            if unit_price is None:
                continue

            # Currency conversion: if rial, convert to toman (divide by 10)
            if currency == "rial":
                unit_price = unit_price / 10.0
                if line_total is not None:
                    line_total = line_total / 10.0

            # Shorthand thousands: if unit price is tiny (e.g. 15 to 999) for spare parts
            if 5 <= unit_price < 1000 and (line_total is None or line_total < 50000):
                unit_price *= 1000
                if line_total is not None:
                    line_total *= 1000

            u_price_int = int(round(unit_price))
            l_total_int = int(round(line_total)) if line_total is not None else int(round(qty * u_price_int))

            # Arithmetic verification
            verified = abs(qty * u_price_int - l_total_int) <= max(5.0, l_total_int * 0.02)
            confidence = 0.96 if verified else 0.75

            # Unit classification
            is_pack = any(k in unit_str for k in ("بسته", "کارتن", "جعبه", "شل", "پک"))
            unit_key = "pack" if is_pack else "unit"

            lines.append({
                "name_raw": name_raw,
                "quantity": int(qty) if qty.is_integer() else round(qty, 2),
                "unit": unit_key,
                "unit_label": unit_str,
                "pack_size": 1,
                "unit_price": u_price_int,
                "line_total": l_total_int,
                "verified": verified,
                "confidence": confidence,
            })

    # If table mode didn't find lines, attempt line-by-line fallback parsing
    if not lines:
        lines = _fallback_line_parser(raw_lines, currency)

    # Reconcile printed total with calculated sum
    calculated_total = sum(item["line_total"] for item in lines)
    if printed_total is not None and currency == "rial":
        printed_total = int(round(printed_total / 10.0))

    return {
        "supplier_name": supplier_name,
        "invoice_no": invoice_no,
        "invoice_date": invoice_date,
        "currency": "toman",
        "printed_total": printed_total,
        "calculated_total": calculated_total,
        "lines": lines,
        "quality": {
            "ok": len(lines) > 0,
            "message": "فاکتور با موفقیت خوانده شد" if lines else "جدول اقلام فاکتور یافت نشد. لطفاً عکس واضح‌تری ارسال کنید.",
        },
    }


def _fallback_line_parser(raw_lines: list[str], currency: str) -> list[dict[str, Any]]:
    """Heuristic line parser when markdown pipes are absent."""
    items: list[dict[str, Any]] = []
    for line in raw_lines:
        line_clean = normalize_persian_text(line)
        if re.search(r"^(جمع|شماره|تاریخ|تلفن|آدرس|فروشنده|خریدار|صورتحساب)", line_clean):
            continue
        # Check for numbers in line
        numbers = [
            parse_persian_number(m.group(0))
            for m in re.finditer(r"[\d۰-۹٠-٩,،/.-]+", line_clean)
        ]
        valid_nums = [n for n in numbers if n is not None and n > 0]
        if len(valid_nums) >= 2:
            # First non-number portion as product name
            name_part = re.sub(r"[\d۰-۹٠-٩,،/.-]+", "", line_clean).strip(" -:\t|")
            if len(name_part) >= 2:
                qty = valid_nums[0] if valid_nums[0] <= 1000 else 1.0
                price = valid_nums[1] if qty == valid_nums[0] and len(valid_nums) > 1 else valid_nums[0]
                if currency == "rial":
                    price /= 10.0
                u_price = int(round(price))
                total = int(round(qty * u_price))
                items.append({
                    "name_raw": name_part,
                    "quantity": int(qty) if qty.is_integer() else round(qty, 2),
                    "unit": "unit",
                    "unit_label": "عدد",
                    "pack_size": 1,
                    "unit_price": u_price,
                    "line_total": total,
                    "verified": True,
                    "confidence": 0.8,
                })
    return items


def match_products_to_inventory(
    db: Session,
    store_id: int,
    extracted_items: list[dict[str, Any]],
    invoice_type: str = "purchase"
) -> list[dict[str, Any]]:
    """
    Intelligently maps extracted OCR rows to the store's inventory items using:
    - Custom label exact/token matching
    - Catalog product name & part number matching
    - SKU & Barcode matching
    """
    store_products = db.scalars(
        select(InventoryItem)
        .options(
            joinedload(InventoryItem.catalog_product),
            joinedload(InventoryItem.labels),
        )
        .where(
            InventoryItem.store_id == store_id,
            InventoryItem.deleted_at.is_(None),
            InventoryItem.is_hidden.is_(False),
        )
    ).unique().all()

    enriched_items: list[dict[str, Any]] = []

    for item in extracted_items:
        raw_name = item.get("name_raw", "").strip()
        cleaned_raw = normalize_persian_text(raw_name)
        raw_tokens = [
            t for t in re.split(r"[\s،,-]+", cleaned_raw)
            if t and t not in STOP_WORDS and len(t) >= 2
        ]

        best_product: InventoryItem | None = None
        best_score = 0.0

        for prod in store_products:
            prod_name = prod.custom_label or (prod.catalog_product.name if prod.catalog_product else "") or ""
            prod_part = (prod.catalog_product.part_number if prod.catalog_product else "") or ""
            prod_sku = prod.sku or ""

            # 1. Exact match on part number or SKU
            if prod_part and prod_part.lower() in cleaned_raw.lower():
                best_score = 0.98
                best_product = prod
                break
            if prod_sku and prod_sku.lower() in cleaned_raw.lower():
                best_score = 0.98
                best_product = prod
                break

            # 2. Token similarity match
            target_str = normalize_persian_text(f"{prod_name} {prod_part}")
            target_tokens = [
                t for t in re.split(r"[\s،,-]+", target_str)
                if t and t not in STOP_WORDS and len(t) >= 2
            ]

            score = _token_similarity(raw_tokens, target_tokens)
            # Glued words check e.g. "کوکاکولا" vs "کوکا کولا" or "پژو۲۰۶" vs "پژو ۲۰۶"
            glued_raw = re.sub(r"\s+", "", cleaned_raw)
            glued_target = re.sub(r"\s+", "", target_str)
            if len(glued_target) >= 4 and (glued_target in glued_raw or glued_raw in glued_target):
                score = max(score, 0.92)

            if score > best_score:
                best_score = score
                best_product = prod

        # Enrich line item with matched product metadata
        item_copy = dict(item)
        if best_product is not None and best_score >= 0.55:
            item_copy["matched_product_id"] = best_product.id
            item_copy["matched_product_name"] = best_product.custom_label or (
                best_product.catalog_product.name if best_product.catalog_product else f"محصول {best_product.id}"
            )
            item_copy["current_stock"] = best_product.quantity
            item_copy["suggested_price"] = (
                best_product.purchase_price if invoice_type == "purchase" else best_product.sale_price
            ) or best_product.sale_price or 0
            item_copy["match_score"] = round(best_score, 2)
        else:
            item_copy["matched_product_id"] = None
            item_copy["matched_product_name"] = None
            item_copy["current_stock"] = 0
            item_copy["suggested_price"] = item_copy.get("unit_price", 0)
            item_copy["match_score"] = 0.0

        enriched_items.append(item_copy)

    return enriched_items


def request_dongi_ocr(image_bytes: bytes, filename: str = "invoice.jpg") -> str:
    """
    Submits an invoice image to the Dongi OCR engine.
    Tries local 127.0.0.1:8031 first, then public endpoint fallback.
    """
    token = settings.DONGI_OCR_TOKEN
    urls = [settings.DONGI_OCR_URL, settings.DONGI_OCR_PUBLIC_URL]

    boundary = "----TanzimOcrFormBoundary" + base64.b64encode(b"tanzim").decode()
    body_parts: list[bytes] = []
    # format=markdown
    body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"format\"\r\n\r\nmarkdown\r\n".encode())
    # preprocess=off
    body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"preprocess\"\r\n\r\noff\r\n".encode())
    # file
    body_parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        f"Content-Type: image/jpeg\r\n\r\n".encode() + image_bytes + b"\r\n"
    )
    body_parts.append(f"--{boundary}--\r\n".encode())
    multipart_body = b"".join(body_parts)

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }

    last_error: Exception | None = None
    for url in urls:
        if not url:
            continue
        try:
            req = urllib.request.Request(url, data=multipart_body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=35) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "markdown" in data and data["markdown"]:
                    return str(data["markdown"])
        except Exception as exc:
            logger.warning("OCR call to %s failed: %s", url, exc)
            last_error = exc

    # If OCR endpoint fails, try Gemini multimodal vision chat
    try:
        return request_gemini_vision_invoice(image_bytes)
    except Exception as gemini_err:
        logger.error("Gemini vision fallback failed: %s", gemini_err)

    if last_error:
        raise RuntimeError(f"OCR processing failed: {last_error}")
    raise RuntimeError("OCR service did not return text")


def request_gemini_vision_invoice(image_bytes: bytes) -> str:
    """Uses Gemini vision model via Dongi Chat to parse Persian invoice images directly."""
    token = settings.DONGI_OCR_TOKEN
    urls = [settings.DONGI_CHAT_URL, settings.DONGI_CHAT_PUBLIC_URL]
    b64_img = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:image/jpeg;base64,{b64_img}"

    system_prompt = (
        "You read Iranian (Persian) purchase and sales invoices and receipts. "
        "Extract the table into a clear Markdown table format with columns: "
        "| ردیف | شرح کالا | تعداد | واحد | فی | مبلغ کل |\n"
        "Include seller/store name, invoice number, date, and total amount."
    )

    payload = json.dumps({
        "model": settings.AI_VISION_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "لطفاً این فاکتور را بخوانید و جدول اقلام و مشخصات را استخراج کنید."},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ],
        "max_tokens": 1500,
        "temperature": 0.1,
    }).encode("utf-8")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    for url in urls:
        if not url:
            continue
        try:
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                reply = data.get("reply") or data.get("content") or ""
                if reply:
                    return str(reply)
        except Exception as exc:
            logger.warning("Gemini vision chat call to %s failed: %s", url, exc)

    raise RuntimeError("Multimodal AI vision processing unavailable")


def get_sample_invoice_result(db: Session, store_id: int) -> dict[str, Any]:
    """Generates a demo realistic invoice from the store's own catalog for instant testing."""
    products = db.scalars(
        select(InventoryItem)
        .options(joinedload(InventoryItem.catalog_product))
        .where(
            InventoryItem.store_id == store_id,
            InventoryItem.deleted_at.is_(None),
            InventoryItem.is_hidden.is_(False),
        )
        .limit(5)
    ).unique().all()

    sample_lines = []
    if products:
        for p in products:
            name = p.custom_label or (p.catalog_product.name if p.catalog_product else f"کالای {p.id}")
            price = p.purchase_price or p.sale_price or 150000
            qty = 2
            total = qty * price
            sample_lines.append({
                "name_raw": name,
                "quantity": qty,
                "unit": "unit",
                "unit_label": "عدد",
                "pack_size": 1,
                "unit_price": price,
                "line_total": total,
                "verified": True,
                "confidence": 0.98,
                "matched_product_id": p.id,
                "matched_product_name": name,
                "current_stock": p.quantity,
                "suggested_price": price,
                "match_score": 1.0,
            })
    else:
        sample_lines = [
            {
                "name_raw": "لنت ترمز جلو پراید گلد کره",
                "quantity": 4,
                "unit": "unit",
                "unit_label": "دست",
                "pack_size": 1,
                "unit_price": 420000,
                "line_total": 1680000,
                "verified": True,
                "confidence": 0.97,
                "matched_product_id": None,
                "matched_product_name": None,
                "current_stock": 0,
                "suggested_price": 420000,
                "match_score": 0.0,
            },
            {
                "name_raw": "شمع موتور بوش پایه کوتاه",
                "quantity": 8,
                "unit": "unit",
                "unit_label": "عدد",
                "pack_size": 1,
                "unit_price": 95000,
                "line_total": 760000,
                "verified": True,
                "confidence": 0.98,
                "matched_product_id": None,
                "matched_product_name": None,
                "current_stock": 0,
                "suggested_price": 95000,
                "match_score": 0.0,
            },
            {
                "name_raw": "روغن موتور بهران پیشتاز ۲۰W-50",
                "quantity": 3,
                "unit": "unit",
                "unit_label": "عدد",
                "pack_size": 1,
                "unit_price": 385000,
                "line_total": 1155000,
                "verified": True,
                "confidence": 0.99,
                "matched_product_id": None,
                "matched_product_name": None,
                "current_stock": 0,
                "suggested_price": 385000,
                "match_score": 0.0,
            },
        ]

    calc_total = sum(l["line_total"] for l in sample_lines)
    return {
        "supplier_name": "پخش تخصصی قطعات یدکی پیشرو",
        "invoice_no": "10482",
        "invoice_date": "1405/09/03",
        "currency": "toman",
        "printed_total": calc_total,
        "calculated_total": calc_total,
        "lines": sample_lines,
        "quality": {"ok": True, "message": "فاکتور نمونه با موفقیت ایجاد شد"},
        "sample": True,
    }
