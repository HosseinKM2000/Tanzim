# نقشهٔ معماری و شواهد TZ-V1-SCB

## خط مبنا و قرارداد نسخه

- شاخهٔ مبنا: `draft` در `ceba78491d219097654405b407a4f02224ae9e62`.
- شاخهٔ کار: `feat/v1-sectors-categories-barcode-lifecycle`.
- سر Alembic پیشین `20261110_0018` و سر افزوده‌شده `20261116_0019` است.
- نسخهٔ Dexie همچنان ۱۴ است؛ جدول تازه‌ای لازم نشد و فیلدهای lifecycle در رکوردهای موجود به‌شکل سازگار افزوده شدند.
- نسخهٔ backup از ۵ به ۶ رسیده و reader نسخه‌های ۱ تا ۶ را می‌پذیرد.
- دادهٔ مرجع از `backend/app/reference_data/tanzim_sector_categories_v1.json` می‌آید: ۲۴ حوزه، ۲۸۱ دسته، ۲۵ approved و ۲۵۶ proposed.
- فعال‌سازی فروشگاه با `TAXONOMY_ADOPTION_ENABLED=false` پیش‌فرض خاموش است. دادهٔ مرجع خواندنی و migration قابل نصب است، اما هیچ فروشگاهی ناخواسته وارد قرارداد تازه نمی‌شود.

## مرزهای موجود و نقاط اتصال

| دامنه | مدل/ذخیره | سرویس و route اصلی | مصرف‌کننده/شاهد |
|---|---|---|---|
| عضویت و store | `Store`, `StoreMembership`, `User` در `backend/app/models.py` | `backend/app/deps.py`, `backend/app/services/store_authorization.py` | همهٔ routeهای تازه از `CurrentUser` و `user.store_id` استفاده می‌کنند؛ هیچ `store_id` کلاینتی پذیرفته نمی‌شود. |
| signup و setup | `backend/app/routers/auth.py` | `/api/auth/signup`, `/api/taxonomy/state`, `/api/taxonomy/adopt` | `src/features/setting/components/industry/industry-form.tsx`؛ adoption فقط owner، online، version-bound و با rollout gate است. |
| حوزه و کاتالوگ | `Industry`, `ReferenceSector`, `ReferenceCategory` | `backend/app/services/taxonomy_service.py`, `backend/app/services/catalog_provisioning_service.py` | `/api/taxonomy/sectors` فقط تعریف‌ها را می‌دهد؛ category پیشنهادی از مرز approved عبور نمی‌کند. |
| دسته | `Category` موجود، با metadata افزوده | `backend/app/routers/categories.py`, مسیر category در `backend/app/routers/sync.py` | `category.service.ts`, `category-sync.ts`, settings categories؛ system immutable و custom با code ثابت است. |
| محصول و bulk/import | `InventoryItem` موجود | `backend/app/routers/products.py`, product handler در `sync.py` | `inventory-service.ts`, `excel-import.service.ts`, فرم تکی و bulk؛ create بعد adoption دستهٔ معتبر می‌خواهد، patch نامرتبط legacy حفظ می‌شود. |
| رزرو بارکد | `ProductBarcode` موجود و `BarcodeReservation` تازه | `taxonomy_service.py`, `sync.py`, `/taxonomy/barcodes/resolve` | `barcode-service.ts`, invoice selection، scanner page و barcode manager؛ رزرو بر مبنای `(store_id,value)` و lifecycle فعال/بازنشسته/حذف‌شده است. |
| تغییر دسته | همان product/category/barcode | preview/confirm در `taxonomy_service.py` و `/taxonomy/recategorization/*` | edit و bulk dialog؛ token به store، مقصد، target/version/count و expiry مقید است. |
| Solo/Team | `SyncOperation`, `SyncChange`, Dexie `syncQueue` | `sync.py`, `team-command-service`, `local-mutation-storage.ts` | Solo محصول+بارکد+outbox را در یک transaction می‌نویسد؛ Team فقط پاسخ پذیرفته‌شده را project می‌کند. |
| scan و movement | `ProductBarcode`, `InventoryMovement` | resolver مشترک local/server و validation پذیرش sync | invoice، scanner عمومی و quantity؛ retired/ambiguous/unavailable هیچ اثر خودکاری ندارد. |
| backup/restore | backup envelope و recovery journal موجود | `backup-format.ts`, `backup-restore.ts`, `backup-snapshot.ts` | schema 6 lifecycle را حمل می‌کند؛ current-over-import و review/reconciliation مانع resurrection قطعی می‌شود. |
| PWA و ارتقا | Dexie 14، service worker موجود | `db.ts`, update safety و real two-build harness | schema IndexedDB عوض نشده؛ outbox/OPFS/cache پاک نمی‌شود. |
| label | `label-renderer.ts`, profileهای ۵۰×۳۰ و A4 سه‌ستونه | bwip-js Code 128 و `validateLabelFit` | مسیر چاپ کد ۱۲۸‌بیتی روی هر دو profile فعلی به‌درستی رد می‌شود؛ این rollout blocker است. |

## نبود مدل variant

در `backend/app/models.py`، schemaها، routeها، Dexie و consumerهای barcode هیچ target مستقل variant وجود ندارد. `BarcodeReservation.target_type` در migration با constraint فقط `product` را می‌پذیرد. بنابراین مسیرهای variant در این فاز `N/A` هستند؛ target عمومی آینده بدون ساخت feature فرضی حفظ نشده و افزودن variant به فاز مستقلی نیاز دارد.

## قرارداد barcode داخلی و تناقض چاپ

فرمت تثبیت‌شده در backend و frontend:

`TZ1-{sectorCode}-{categoryCode}-{26-char Crockford token}`

- alphabet: `0123456789ABCDEFGHJKMNPQRSTVWXYZ`
- entropy: ۱۶ بایت cryptographic، معادل ۱۲۸ بیت
- system category code: کد مرجع؛ custom category code: `C` به‌علاوهٔ ۱۳ نویسهٔ Base32 تصادفی
- حداکثر طول فعلی: ۴۸ نویسه
- ذخیره و lookup: exact، بدون trim/case-fold/Unicode normalization؛ فقط terminatorهای transport اسکنر جدا می‌شوند.

در مدل محافظه‌کارانهٔ Code 128 موجود، طول ۴۸ نویسه ۵۹۶ module می‌خواهد. عرض مفید profile حرارتی ۴۶ میلی‌متر و A4 سه‌ستونه ۴۹٫۵ میلی‌متر است؛ X-dimension حاصل به‌ترتیب حدود ۰٫۰۷۷ و ۰٫۰۸۳ میلی‌متر می‌شود، پایین‌تر از حد ۰٫۱۹ میلی‌متری validator. کاهش entropy یا تغییر بی‌اجازهٔ symbology مجاز نیست. بنابراین:

- migration/reference/reservation می‌توانند بررسی و commit شوند؛
- adoption در سرور و UI پیش‌فرض خاموش می‌ماند؛
- چاپ/فعال‌سازی مشتری تا تصمیم صریح دربارهٔ symbology یا profile عریض‌تر `BLOCKED` است؛
- تست فیزیکی scanner/camera/printer نیز `NOT RUN` است.

## سازگاری legacy

- migration فقط metadata قطعی را backfill می‌کند؛ category قدیمی `origin=legacy` و barcode نامشخص `legacy_unknown` می‌ماند.
- محصول بدون دسته readable و برای patch/transaction نامرتبط قابل استفاده است؛ الزام دسته فقط intent تازهٔ فروشگاه adopted را می‌بندد.
- deleted/hidden history باعث «خالی» دیده‌شدن فروشگاه نمی‌شود؛ `has_historical_inventory_usage` از inventory/invoice/movement/sync و سپس marker پایدار محاسبه می‌شود.
- preflight فقط count و حداکثر ۱۰ ID می‌دهد و barcode خام، payload، token یا اطلاعات هویتی را log نمی‌کند.
- fingerprint/result عملیات قدیمی بازنویسی نمی‌شود و replay همان ID/Payload نتیجهٔ قبلی را برمی‌گرداند.
- backup هیچ authority، credential، membership، role یا subscription تازه‌ای وارد نمی‌کند.
