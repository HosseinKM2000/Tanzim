# ممیزی معماری Catalog و زیرساخت تصویر Tanzim

> تاریخ ممیزی: ۱۴۰۵/۰۸/۲۶ (2026-11-17)
> دامنه: وضعیت موجود Repository؛ بدون تغییر کد، Migration یا زیرساخت
> روش: ردیابی مدل، API، UI، IndexedDB/OPFS، Service Worker، Sync و تست‌های موجود. هر ادعای استقرار که در Repository قابل اثبات نباشد با «قابل تأیید نیست» مشخص شده است.

| بخش | وضعیت فعلی | میزان آمادگی | نیاز به تغییر |
|---|---|---|---|
| Catalog Model | مدل مشترک server-side با شناسه پایدار و یک `image_url` | متوسط | pagination، خانواده/asset reference و انتشار نسخه‌دار |
| Excel Import | import محلی Inventory با ۷ ستون، حداکثر ۱۰۰۰ ردیف | کم برای Catalog | مسیر مستقل admin/catalog و قرارداد batch لازم است |
| Image Storage | تصاویر عملیاتی در OPFS؛ media سرور در filesystem durable و metadata در DB | متوسط | namespace و index مستقل برای reference image |
| Lazy Loading | Catalog فاقد lazy loading؛ List عملیاتی فقط در دو view مجازی است | کم | viewport-aware loader، dedupe و cancellation |
| Offline Cache | app shell در Cache Storage؛ تصویر API عمداً cache نمی‌شود | متوسط برای app، کم برای Catalog | cache خودکار/انتخابی در OPFS |
| Family Manifest | وجود ندارد | صفر | registry و manifest immutable/versioned |
| Download Manager | recovery ساده با ۲ worker وجود دارد؛ pause/resume پایدار ندارد | کم تا متوسط | manager مستقل با journal پایدار |
| Backend File Serving | FastAPI `FileResponse` با auth، DB lookup، ETag و private cache | متوسط | reference endpoint/file origin قابل تعویض و proxy tuning |
| Sync Separation | journal آپلود media از outbox جداست | خوب | دانلود Catalog باید بیرون outbox بماند |
| CDN Readiness | `image_url` آزاد و `VITE_API_URL` وجود دارد، ولی media auth-bound است | کم تا متوسط | base URL، immutable public/signed policy و CORS |

## 1. Executive Summary

ساختار فعلی برای تصویر اختصاصی Inventory طراحی شده، نه برای کتابخانه عمومی ده‌هاهزار تصویر Catalog. بخش‌های ارزشمند و قابل استفاده مجدد عبارت‌اند از پردازش WebP، OPFS، quota check، hash verification، قفل account/store و journal مستقل انتقال media. در مقابل، Catalog همه رکوردها را بدون pagination برمی‌گرداند، UI تمام کارت‌ها و تصاویر را یک‌جا mount می‌کند، مدل فقط یک رشته `image_url` دارد و category/label موجود متعلق به Store/Inventory است؛ بنابراین family manifest از labels فعلی قابل استخراج مطمئن نیست.

پیشنهاد نهایی، ترکیب **گزینه B با مرزبندی گزینه C** است: زیرساخت low-level فعلی (OPFS، hash، quota، retry primitives) reuse شود، اما «Reference Catalog Media» دارای registry، manifest و download journal مستقل از `MediaAsset` خصوصی Store و مستقل از outbox عملیاتی باشد. V1 روی همان سرور اجرا شود، ولی URL در manifest نسبی/asset-key باشد و resolver قابل تنظیم، تا انتقال به CDN بازطراحی مدل Catalog را لازم نکند.

بزرگ‌ترین ریسک‌ها: materialize شدن Catalog در Inventory هر Store، query/list بدون pagination، eager image loading، یکسان بودن `preview` و `detail`، نبود family identity پایدار، نبود media volume در compose موجود، و نبود اطلاعات واقعی bandwidth/reverse proxy/HTTP2. هیچ benchmark اجرا نشد؛ اعداد عملکردی این گزارش تحلیل سناریو هستند نه اندازه‌گیری.

## 2. وضعیت واقعی پروژه و معماری فعلی

- Frontend: React 19، TypeScript، Vite، React Query، Dexie و TanStack Virtual؛ وابستگی‌ها در `package.json:24-44` و build manifest در `vite.config.ts:25-59`.
- Backend: FastAPI + SQLAlchemy + Alembic + PostgreSQL؛ routerها در `backend/app/main.py:78-99` ثبت می‌شوند.
- tenant boundary در داده عملیاتی `store_id` است. تصاویر private نیز در lookup و storage key با Store محدود شده‌اند (`backend/app/routers/media.py:92-96,116-124,133-145`).
- Catalog مشترک server-side است؛ local store مستقل برای Catalog وجود ندارد. هنگام انتخاب صنعت یا ساخت محصول Catalog، `InventoryItem` مرجع برای Storeهای واجد شرایط ایجاد می‌شود (`backend/app/services/catalog_provisioning_service.py:44-73,90-114` و `catalog_product_service.py:45-109`).
- IndexedDB داده Inventory، category، label، outbox و transfer journal را به actor+store partition می‌کند (`src/shared/lib/infrastructure/storage/db.ts:196-218,278-305`).

### یافته کلیدی 1 — Catalog در مقیاس بزرگ به Inventory تکثیر منطقی می‌شود

- **Finding:** محصول Catalog مستقل است، اما برای هر Store صنعت یک `InventoryItem` ساخته می‌شود.
- **Evidence:** حلقه روی تمام Catalog محصولات و ایجاد row در `provision_industry_inventory`؛ reconciliation محصول جدید نیز روی تمام Storeهای صنعت حرکت می‌کند.
- **File Path:** `backend/app/services/catalog_provisioning_service.py:44-55,90-114`؛ `backend/app/services/catalog_product_service.py:75-108`.
- **Relevant Functions / Modules:** `provision_industry_inventory`، `_reconcile_catalog_assignments`.
- **Current Behavior:** رابطه با `catalog_product_id` حفظ می‌شود؛ متن Catalog در DB کپی نمی‌شود، ولی row عملیاتی و SyncChange برای Store ایجاد می‌شود.
- **Limitation or Risk:** رشد Catalog می‌تواند تعداد Inventory row و sync payload را متناسب با Storeها زیاد کند؛ ساخت محصول admin شامل query/count برای Storeهاست.
- **Recommendation:** reference Catalog browsing را از provisioning عملیاتی جدا کنید؛ فقط انتخاب/فعال‌سازی واقعی محصول باید Inventory row بسازد.
- **Confidence:** Confirmed.

## 3. نقشه فایل‌ها و ماژول‌های مرتبط

| مسئولیت | فایل/خطوط اصلی |
|---|---|
| مدل Catalog/Inventory/Media | `backend/app/models.py:353-419,423-517,521-600` |
| schema API | `backend/app/schemas.py:395-482,510-547` |
| query و CRUD Catalog | `backend/app/repositories/catalog_products.py:11-46`؛ `backend/app/services/catalog_product_service.py:112-253` |
| API Catalog | `backend/app/routers/catalog_products.py:22-156` |
| provisioning | `backend/app/services/catalog_provisioning_service.py:29-130` |
| UI Catalog | `src/features/setting/components/catalogs/index.tsx:30-228` |
| فرم Catalog | `src/features/setting/components/catalogs/catalog-form-dialog.tsx:36-147,203-246` |
| Excel | `src/features/app/inventory/services/excel-import.service.ts:9-132` |
| OPFS/processing | `src/shared/lib/infrastructure/media/image.repository.ts:1-104`؛ `image-processor.ts:17-79` |
| media upload/recovery | `media-transfer.service.ts:22-190`؛ `media-recovery.service.ts:34-108` |
| backend media | `backend/app/media_storage.py:8-46`؛ `backend/app/routers/media.py:20-170` |
| local DB/outbox | `src/shared/lib/infrastructure/storage/db.ts:32-55,278-305`؛ `sync-service.ts:145-249` |
| PWA cache | `public/sw.js:1-209`؛ `src/main.tsx:34-79` |

## 4. مدل محصول کاتالوگی

`catalog_products.id` شناسه مستقل و پایدار دارد. row می‌تواند بدون Inventory وجود داشته باشد، هرچند سرویس create بلافاصله تلاش می‌کند آن را برای Storeهای صنعت provision کند. Inventory رابطه مرجع را با FK نگه می‌دارد (`backend/app/models.py:560-563`) و uniqueness در سطح Store+Catalog دارد (`:523-528`). یک Catalog فقط یک `image_url` دارد و هیچ رابطه‌ای به `MediaAsset` یا مجموعه تصاویر ندارد.

### جدول دقیق فیلدهای واقعی CatalogProduct

| فیلد | نوع DB / API | الزام | استفاده واقعی |
|---|---|---|---|
| `id` | BigInteger / integer | server-generated | شناسه مرجع Inventory و API |
| `industry_id` | FK / integer > 0 | اجباری create | فیلتر و provisioning صنعت |
| `name` | varchar(200) / string 1..200 | اجباری | جست‌وجو، نمایش، uniqueness منطقی در صنعت |
| `description` | Text / string ≤5000 | اختیاری | جست‌وجو و نمایش؛ مناسب مشخصات فنی فعلی |
| `brand` | varchar(120) | اختیاری | جست‌وجو و نمایش |
| `image_url` | varchar(500) | اختیاری | URL واحد؛ preview مستقیم در UI |
| `is_packaged` | boolean | اجباری با default false | تعیین بسته‌بندی |
| `pack_size` | integer ≥1 | مشروط | فقط وقتی `is_packaged=true` |
| `is_shared` | boolean | داخلی، default true | تفکیک Catalog مشترک از private legacy |
| `is_active` | boolean | داخلی، default true | archive/restore |
| `created_at` | timestamptz | server-generated | مرتب‌سازی newest و نمایش |

شواهد: `backend/app/models.py:423-486`، constraints در `:425-437`، validation در `backend/app/schemas.py:395-457` و خروجی در `:459-482`. برای قطعات برقی خودرو اکنون فقط نام، برند، توضیحات، یک تصویر، صنعت و بسته‌بندی قابل ثبت است؛ پین/اتصال/کاربرد/سوکت باید مطابق شرط مأموریت در `description` ثبت شود. barcode، category و label فیلد Catalog نیستند.

## 5. قرارداد Import اکسل

- importer فعال `parseProductWorkbook` است و فقط `.xlsx` تا 5 MiB و ۱۰۰۰ ردیف می‌پذیرد (`excel-import.service.ts:43-60`).
- ستون‌ها: نام محصول، تعداد، قیمت فروش، قیمت خرید، توضیحات، یادداشت، بارکد اصلی؛ قیمت legacy نیز پشتیبانی می‌شود (`:9-15,52-58`).
- نام و تعداد الزامی؛ نام ≤200؛ اعداد صحیح نامنفی؛ barcode با symbology اعتبارسنجی می‌شود (`:21-31,67-77`). formula، hyperlink و مقدار مرکب رد می‌شود (`:34-40`).
- duplicate فقط برای barcode در فایل و barcode فعال موجود بررسی می‌شود (`:103-115`). تشخیص duplicate بر اساس نام وجود ندارد.
- import در chunkهای ۵۰تایی به `inventoryService.createMany` می‌رود (`:117-132`)؛ transaction سراسری همه ۱۰۰۰ ردیف یا bulk API Catalog وجود ندارد.
- تصویر، category و label ستونی ندارند. این import برای Inventory است، نه admin shared Catalog (`toProduct` در `:98-101`).
- مسیر داده Local-First است، اما مجاز بودن ابزار/قابلیت و رفتار Team وابسته به `accessState` و createMany است؛ تضمین import کامل offline برای همه planها از این فایل قابل تأیید نیست.

## 6. مدل دسته‌بندی و برچسب

Category و Label هر دو Store-scoped هستند؛ unique constraints به‌ترتیب `(store_id,name)` و `(store_id,normalized_name)` دارند (`backend/app/models.py:354-399`). اتصال Label از جدول میانی `inventory_item_labels` به `InventoryItem` است (`:407-419`)؛ CatalogProduct هیچ label/category ندارد. local stores نیز actor+store scoped هستند (`db.ts:196-202`).

فیلتر Inventory در کلاینت انجام می‌شود: ابتدا تمام Inventory از Dexie `toArray` خوانده و سپس category/label/search filter می‌شود (`inventory-storage.ts:10`؛ `inventory-service.ts:163-204`). index رابطه label→product در Dexie وجود ندارد و `label_ids` داخل Product scan می‌شود. در DB سرور junction PK امکان query رابطه را می‌دهد، ولی endpoint family/catalog بر مبنای آن وجود ندارد. بنابراین labels فعلی نه family registry مرجع‌اند و نه identifier پایدار بین Storeها.

### یافته کلیدی 2 — خانواده Catalog از label موجود قابل استخراج نیست

- **Finding:** label فعلی شخصی/Store-scoped و متصل به Inventory است.
- **Evidence:** مدل و junction فاقد `catalog_product_id`؛ Catalog schema نیز label ندارد.
- **File Path:** `backend/app/models.py:392-419,423-490`؛ `backend/app/schemas.py:459-482`.
- **Relevant Functions / Modules:** `Label`، `InventoryItemLabel`، `CatalogProductOut`.
- **Current Behavior:** فیلتر label روی snapshot محلی Inventory انجام می‌شود.
- **Limitation or Risk:** family manifest تولیدشده از labels Storeها ناپایدار، tenant-specific و نیازمند scan است.
- **Recommendation:** registry مستقل و versioned برای CatalogFamily و association انتشار Catalog؛ labels شخصی دست‌نخورده بمانند.
- **Confidence:** Confirmed.

## 7. معماری ذخیره‌سازی تصاویر

دو مسیر فعال وجود دارد:

1. **Legacy URL/upload:** `CatalogProduct.image_url` یا `InventoryItem.image_url` می‌تواند URL یا `/uploads/name` باشد. فایل legacy در `UPLOAD_DIR` است و فقط بعد از DB authorization با `/api/files/{filename}` ارائه می‌شود (`backend/app/routers/files.py:14-32`). فرم Catalog فقط رشته URL می‌گیرد، upload ندارد (`catalog-form-dialog.tsx:203-219`).
2. **Durable private media:** client فایل را resize/WebP کرده، در `inventory-images` OPFS با نام `product-{UUID}.webp` می‌گذارد (`image.repository.ts:1-42`)؛ upload با SHA-256 انجام و سرور در `stores/{store}/{hash-prefix}/{hash}.webp` ذخیره می‌کند (`media.py:103-125`). metadata در `media_assets` و FK در Inventory است (`models.py:493-517,576-580`).

OPFS client content-addressed نیست؛ تصویر یکسان با UUID دوباره ذخیره می‌شود. سرور bytes را content-addressed و `put_if_absent` می‌کند، ولی metadata transfer تازه می‌تواند تکرار شود و unique روی hash وجود ندارد. orphan cleanup در startup پس از sync انجام می‌شود (`src/main.tsx:71-78`؛ `inventory-service.ts:585-592`). quota فقط advisory estimate قبل از write است (`storage-quota.service.ts:14-47`)؛ handling صریح `QuotaExceededError`/reserved headroom وجود ندارد.

پردازش input: JPEG/PNG/WebP/AVIF، حداکثر 12 MiB، 1280×1280، خروجی WebP تا 2.5 MiB و quality از 0.84 تا 0.70 (`image.constants.ts:3-27`؛ `image-processor.ts:53-71`). thumbnail جدا یا original حفظ نمی‌شود. canvas re-encode عملاً metadata فایل را منتقل نمی‌کند، اما «EXIF stripping» به‌صورت قرارداد/test صریح یافت نشد. پردازش روی main thread و تک‌فایل است؛ batch هزاران تصویر برای این مسیر طراحی نشده است.

## 8. فرایند واقعی بارگذاری و نمایش تصاویر

Catalog admin با `resolveAssetUrl` URL را resolve و همه `<img>`ها را بدون `loading="lazy"` mount می‌کند (`catalogs/index.tsx:158-175`). pagination، virtualization، IntersectionObserver، cancellation یا request coalescing وجود ندارد. تغییر search query جدید می‌سازد، اما تصاویر قبلی فقط با unmount مرورگر رها می‌شوند.

Inventory اولویت مسیر را `local://`، سپس `media_preview_url`، سپس image URL و Catalog URL قرار می‌دهد (`inventory-card.tsx:76-83`). `useResolvedImage` برای OPFS و protected API، fetch را در effect انجام و Blob URL را در cleanup revoke می‌کند (`useImage.ts:16-50`). `AbortController` ندارد؛ نتیجه request پس از unmount نادیده گرفته می‌شود ولی network الزاماً cancel نمی‌شود. requestهای همسان بین componentها coalesce نمی‌شوند.

List/compact Inventory با TanStack Virtual و overscan=10 مجازی است (`useInventoryVirtual.ts:5-17` و `inventory-list.tsx:302-316`)؛ grid path مجازی نیست. `<img>` خود نیز lazy attribute ندارد، اما virtualization تعداد mounted image را در دو view محدود می‌کند. `preview` و `detail` server هر دو همان فایل WebP را می‌دهند؛ thumbnail واقعی نیست (`media.py:148-169`).

### یافته کلیدی 3 — Lazy Loading Catalog وجود ندارد

- **Finding:** metadata و DOM و image requestهای Catalog eager هستند.
- **Evidence:** API list آرایه کامل و UI `catalogs.map` با `<img src>` مستقیم.
- **File Path:** `backend/app/routers/catalog_products.py:22-36`؛ `repositories/catalog_products.py:11-46`؛ `catalogs/index.tsx:158-223`.
- **Relevant Functions / Modules:** `get_catalog_products`، `Catalogs`.
- **Current Behavior:** تمام نتایج query در response و تمام کارت‌ها در DOM قرار می‌گیرند.
- **Limitation or Risk:** ۱٬۰۰۰ تا ۵۰٬۰۰۰ رکورد/تصویر برای memory، network و rendering نامناسب است.
- **Recommendation:** cursor pagination، virtualized grid و viewport scheduler پیش از گسترش dataset.
- **Confidence:** Confirmed.

## 9. معماری Backend و ارائه فایل

آپلود durable حداکثر 3 MiB، فقط WebP و حداکثر 16MP است؛ hash/type/dimensions سمت سرور verify می‌شود (`media.py:20-45,103-125`). خواندن media نیازمند auth، Store match و وجود association Inventory است؛ سپس `FileResponse` با ETag، hash/version headers و `private, max-age=31536000, immutable` برمی‌گردد (`:133-170`). هر image private حداقل یک DB lookup asset و یک DB lookup association دارد. variant processing هنگام request وجود ندارد.

Legacy `/files` نیز DB authorization دارد ولی ETag/Cache-Control اختصاصی در کد تعیین نشده (`files.py:14-32`). URL کامل external ممکن است مستقیم در DB ذخیره شود، چون `image_url` فقط trim/length validation دارد. `API_ORIGIN` از `VITE_API_URL` مشتق می‌شود (`client.ts:7-11,133-140`).

Brotli/Gzip، reverse proxy، HTTP/2/3، TLS، bandwidth، rate limit و concurrency limit در Repository یافت نشد و وضعیت production قابل تأیید نیست. `docker-compose.yml:3-23` فقط PostgreSQL و volume آن را تعریف می‌کند؛ media service/volume در compose موجود نیست.

## 10. وضعیت Service Worker و Cache

Service Worker اختصاصی است، نه Workbox. build ID در build stamp می‌شود (`vite.config.ts:9-20`). install به‌صورت all-or-nothing app shell و تمام Vite manifest assets را precache می‌کند (`public/sw.js:38-68,92-95`). navigation network-first با fallback `index.html` است (`:157-164`)؛ static assets cache-first و dynamic fill هستند (`:177-192`). cacheهای قدیمی فقط وقتی تمام clientهای شناخته‌شده build جدید را اعلام کنند پاک می‌شوند (`:80-89,123-126`).

`api/` و `uploads/` صریحاً از fetch handler خارج‌اند (`:147-155`)، پس تصویر Catalog/private در Cache Storage ذخیره نمی‌شود. Cache Storage app shell و OPFS image مستقل‌اند. Background Sync فقط windowها را بیدار می‌کند و app بسته sync را تضمین نمی‌کند (`:195-209`). storage persistence یک بار پس از auth درخواست می‌شود (`auth-provider.tsx:35`؛ `storage-persistence.service.ts:30-59`). grant مرورگر تضمین‌شده نیست و پاک‌کردن صریح user همچنان داده را حذف می‌کند.

برای reference media، OPFS مناسب‌تر از افزودن بی‌قید تصاویر به Service Worker cache است: inventory قابل enumerate، verify و quota-accounting می‌شود و family pinning ممکن است. Cache Storage بهتر است برای app shell و شاید HTTP browser cache باقی بماند. رفتار OPFS و persistence روی نسخه‌های Safari/iOS در این Repository تست/ماتریس سازگاری نشده و **Not Verified** است.

## 11. وضعیت OPFS و ذخیره‌سازی محلی

- namespace واحد `inventory-images` است؛ reference Catalog namespace جدا ندارد.
- filename local UUID-based است؛ media recovered filename asset/version-based است (`media-recovery.service.ts:47-58`).
- existence با file read و missing detection برای Inventory انجام می‌شود (`:38-44`).
- persistence API درخواست می‌شود، اما durability همچنان best-effort است.
- state manifest/download محلی، LRU/access time، pinned family، temporary partial و ownership reference-count وجود ندارد.
- orphan cleanup صرفاً referenceهای `Product.image_url` را حفظ می‌کند؛ اضافه کردن reference image به همین namespace بدون اصلاح cleanup خطر حذف اشتباه دارد.

## 12. وضعیت Sync، Outbox و Backlog

binary داخل outbox نیست. `mediaTransfers` journal scoped به actor/store، hash، retryCount و status دارد (`db.ts:278-305`؛ `media-transfer.service.ts:37-59`). upload پیش از product operation پردازش می‌شود؛ operation دارای `media_transfer_id` تا رسیدن `media_asset_id` block می‌ماند (`sync-service.ts:193-220`؛ `media-transfer.service.ts:186-190`). concurrency فعلی upload دو، retry نمایی تا ۵ دقیقه و سقف پنج تلاش است (`media-transfer.service.ts:33-35,104-126,165-170`). upload idempotency بر transfer ID است؛ resumable range/chunk upload و conflict merge برای bytes وجود ندارد.

recovery/download از outbox جداست و با دو worker همه media مفقود Inventory را download، hash-verify و در OPFS ذخیره می‌کند (`media-recovery.service.ts:47-108`). این الگوی خوبی برای reuse است، اما state پایدار pause/resume/per-file progress ندارد و capability آن به backup وصل است.

### یافته کلیدی 4 — تفکیک Sync پایه مناسبی دارد

- **Finding:** upload media lifecycle از operational outbox جداست و فقط dependency محصول را block می‌کند.
- **Evidence:** دو Dexie table و `processDue` مستقل؛ unrelated records ادامه می‌یابند.
- **File Path:** `db.ts:278-305`؛ `sync-service.ts:193-220`؛ `media-transfer.service.ts:43-59,165-190`.
- **Relevant Functions / Modules:** `mediaTransferService`، `mediaOperationBlocked`، `runSync`.
- **Current Behavior:** failure تصویر فقط operation مربوط را نگه می‌دارد.
- **Limitation or Risk:** bulk reference download اگر در همین journal/outbox قرار گیرد با داده حیاتی رقابت می‌کند.
- **Recommendation:** `catalogDownloadJournal` مستقل با priority پایین و pause هنگام sync؛ outbox فعلی تغییر معنایی نکند.
- **Confidence:** Confirmed.

## 13. تحلیل عملکرد و گلوگاه‌ها

گلوگاه‌های محتمل به ترتیب: (۱) list API و serialization کامل Catalog، (۲) provisioning row/sync fan-out، (۳) DOM و eager image fetch، (۴) FastAPI+DB authorization برای هر فایل، (۵) filesystem/app-server bandwidth. Inventory client نیز `toArray` و filter/sort کامل انجام می‌دهد (`inventory-service.ts:163-204`). این‌ها code-based risk هستند، نه benchmark.

| سناریو | request بالقوه یک مشاهده کامل بدون cache | حجم نمونه با میانگین فرضی 100 KiB/تصویر | اولین گلوگاه محتمل |
|---|---:|---:|---|
| 1,500 / 20 user | تا 30,000 GET | حدود 146 MiB برای هر catalog کامل؛ 2.9 GiB aggregate | eager UI و app server |
| 10,000 / 200 user | تا 2,000,000 GET | حدود 977 MiB/user؛ 191 GiB aggregate | list payload، DB auth، bandwidth |
| 50,000 / 1,000 user | تا 50,000,000 GET | حدود 4.77 GiB/user؛ 4.66 TiB aggregate | همه لایه‌ها؛ CDN/object storage محتمل |

فرض 100 KiB صرفاً sensitivity input است؛ میانگین واقعی، cache hit، session concurrency و bandwidth یافت نشد. Backend resize هنگام GET ندارد، ولی دو query authorization و FileResponse دارد. قبل از CDN: pagination، thumbnails واقعی، immutable reference URLs، reverse-proxy static serving پس از authorization strategy، compression metadata/manifest، connection limits و observability. زمان دقیق نیاز CDN بدون telemetry قابل تعیین نیست.

## 14. امکان‌سنجی Manifest خانواده‌ها

معماری manifest مناسب است، اما بدون افزودن identity/reference metadata قابل اتکا نیست. پیشنهاد contract:

- `catalogId`, `familyId`, `releaseId`, `manifestVersion`, `generatedAt`؛
- entries مرتب و deterministic شامل `assetId`, `contentHash`, `version`, `byteSize`, `width`, `height`, `previewKey`, `detailKey`؛
- manifest immutable با checksum/signature اختیاری و یک pointer کوچک به release جاری؛
- asset key مستقل از hostname؛ client resolver آن را با configurable origin ترکیب کند.

تولید در application build مناسب نیست، چون Catalog data lifecycle مستقل از code deploy است. manifest باید در workflow صریح **Catalog publication** و توسط tool/job مستقل و تکرارپذیر ساخته، validate و atomically publish شود. با مدل فعلی، family registry و association ضروری است؛ خود `CatalogProduct` لازم نیست فیلدهای تخصصی قطعه بگیرد، ولی association/reference asset نیاز به DB یا artifact source authoritative دارد.

## 15. امکان‌سنجی دانلود انتخابی آفلاین

| حالت | محل/تشخیص | update | cleanup و اطمینان |
|---|---|---|---|
| cache خودکار هنگام مشاهده | OPFS reference namespace + index Dexie با hash | compare manifest/asset version | LRU budget؛ best-effort offline |
| family انتخابی | همان blob store، journal و pin relation family→hash | manifest diff | پاک‌سازی فقط unpinned/unreferenced؛ اطمینان بالا پس از verify کامل |
| کل Catalog | همان ساختار با opt-in و preflight quota | release diff | قابل توقف؛ نیاز headroom و هشدار؛ محدودیت device |

blob باید با content hash یک بار ذخیره شود؛ خانواده‌ها فقط reference نگه دارند تا overlap duplicate نسازد. فایل جداگانه بهتر از archive بزرگ است چون diff/retry/random access ساده‌تر است؛ برای latency می‌توان manifest را chunk کرد، نه اینکه V1 تصاویر را در بسته monolithic قرار داد. HTTP Range resume برای فایل‌های کوچک thumbnail احتمالاً ارزش کمی دارد؛ برای فایل‌های بزرگ/pack آینده تصمیم telemetry-based باشد.

Download Manager باید: journal پایدار، state machine، lock account، hash verify، temp-write/atomic finalize، retry/backoff، dedupe in-flight، priority، pause/resume، quota headroom و progress داشته باشد. concurrency اولیه 2–4 صرفاً configuration قابل آزمایش است. bulk queue هنگام offline/save/sync فعال یا شبکه نامناسب pause شود؛ Network Information API در مرورگرهای فاقد پشتیبانی advisory باشد.

## 16. مقایسه گزینه‌های معماری

امتیاز ۱ ضعیف تا ۵ خوب است؛ «تغییر» امتیاز بیشتر یعنی تغییر کمتر.

| معیار | A: reuse بدون تغییر اساسی | B: توسعه با manifest/manager | C: لایه کاملاً مستقل |
|---|---:|---:|---:|
| سازگاری/reuse | 5 | 5 | 2 |
| پیچیدگی توسعه | 4 | 3 | 1 |
| نگهداری | 2 | 4 | 3 |
| موبایل/آفلاین | 2 | 4 | 5 |
| فضای ذخیره/bandwidth | 2 | 5 | 5 |
| مقیاس‌پذیری/CDN | 1 | 5 | 5 |
| ریسک bug | 2 | 4 | 2 |
| تغییر Backend/مدل | 4 | 3 | 1 |

A به‌علت private/store semantics و نبود manifest پاسخ‌گو نیست. C کامل duplication و دو stack image می‌سازد. انتخاب: **B با bounded context مستقل Reference Media**؛ primitives فعلی reuse، ولی tables/journal/API lifecycle و authorization آن با تصاویر خصوصی Inventory مخلوط نشود.

## 17. معماری پیشنهادی نهایی

1. Catalog metadata با cursor API و family filter خوانده شود؛ browse کردن Inventory row نسازد.
2. `CatalogFamily` stable registry و publication release ایجاد شود.
3. `ReferenceMediaAsset` global/shared و content-addressed باشد؛ Catalog به asset اشاره کند. private `MediaAsset` Store-scoped باقی بماند.
4. publication tool thumbnails/detail را پیش‌تولید و manifest immutable منتشر کند.
5. client `ReferenceImageRepository` روی OPFS و metadata/journal در Dexie actor+store یا installation scope تعریف کند؛ تصمیم scope باید قبل از اجرا نهایی شود.
6. visible loader request را dedupe/cancel و priority دهد؛ family manager در lowest priority اجرا شود.
7. server V1 فایل را از durable volume بدهد؛ asset origin resolver بعداً CDN را با config فعال کند.

## 18. ریسک‌ها و اقدامات کنترلی

| شدت | ریسک | کنترل |
|---|---|---|
| بحرانی | fan-out Catalog→Inventory/Sync | جداسازی browse/reference از adoption عملیاتی |
| زیاد | eager list/image و بدون pagination | cursor، virtual grid، viewport loading |
| زیاد | cleanup namespace فعلی فایل reference را orphan تلقی کند | namespace و garbage collector مستقل |
| زیاد | compose فاقد media volume | volume/backup/restore drill و startup probe |
| زیاد | auth per-image مانع CDN و بار DB | reference access policy جدا، immutable URLs یا signed policy |
| متوسط | preview=detail | variant واقعی پیش‌تولیدشده |
| متوسط | quota estimate دقیق/قطعی نیست | safety margin، write error handling، cleanup UI |
| متوسط | storage browser پاک شود | reconcile manifest و redownload؛ عدم وعده مطلق offline |
| متوسط | hash duplicate local | content-addressed filename و reference count |
| نامشخص | Safari/iOS OPFS limits | device matrix و fallback test قبل از rollout |

## 19. تغییرات موردنیاز Frontend

- Catalog API/query: cursor pagination و family/release metadata.
- Catalog grid: virtualization و viewport-aware image component با abort/dedupe.
- ماژول‌های جدید پیشنهادی: `reference-media.repository`, `reference-media-index`, `catalog-download-manager`, `manifest-client`, `asset-origin-resolver`.
- Dexie version جدید برای manifests، assets، family pins و download jobs؛ همه stateهای حساس به account/store partition شوند.
- صفحه «تنظیمات ← تصاویر کاتالوگ» با count/bytes/present/progress/pause/resume/update/remove و storage estimate.
- reuse: `imageRepository` patterns، `storageQuotaService`، hash code، lock/account assertions، Sonner notifications و components تنظیمات. reuse مستقیم namespace/cleanup ممنوع است.

## 20. تغییرات موردنیاز Backend

- cursor endpoints برای Catalog metadata؛ query index متناسب با `(industry/family, active, id)`.
- registry خانواده و association انتشار؛ publication endpoint/tool فقط admin workspace.
- reference asset ingestion با validation، content hash، variants و atomic publish.
- manifest/latest pointer و immutable release/file serving؛ gzip/Brotli در proxy برای JSON.
- observability: bytes, latency, 304/cache hit proxy, failures, concurrent downloads.
- download reference از outbox و Store-private media endpoint جدا بماند.

## 21. تغییرات احتمالی دیتابیس

Migration برای راهکار robust ضروری است: `catalog_families`, `catalog_product_families`, `reference_media_assets`, association محصول/variant و `catalog_releases` یا معادل. افزودن مستقیم فیلدهای تخصصی خودرو به Catalog لازم نیست. اگر source-of-truth خانواده/asset کاملاً artifact-based انتخاب شود، بخشی از جداول می‌تواند حذف شود، ولی admin editing و referential integrity سخت‌تر خواهد شد. تصمیم نهایی DB پس از تعیین publication workflow گرفته شود.

## 22. نیازمندی‌های سرور

- durable media mount خارج deployment root، backup و restore validation؛ الزام config در `backend/app/config.py:55-75` موجود است.
- compose/deployment واقعی باید media volume را صریح mount کند؛ compose فعلی این را نشان نمی‌دهد.
- reverse proxy برای TLS، HTTP/2، conditional GET، compression manifest و rate/concurrency limits پیشنهاد می‌شود؛ وجود فعلی آن **Not Verified**.
- disk capacity/inode monitoring، atomic release directories و garbage collection فقط پس از retention window.
- PostgreSQL و media backup consistency policy؛ authority/credential در media backup وارد نشود.

## 23. آمادگی مهاجرت به CDN

امروز تغییر یک config کافی نیست: private media با Bearer auth و DB association ارائه می‌شود، Catalog ممکن است external full URL یا API-relative URL داشته باشد، و asset identity contract مشترک ندارد. برای آمادگی:

- DB/manifest به‌جای hostname، asset key و version/hash نگه دارد؛
- `VITE_REFERENCE_ASSET_ORIGIN`/runtime config resolver؛
- CORS و cache policy تست‌شده؛
- public immutable reference assets یا signed URL/cookie policy انتخاب شود؛
- origin shield/fallback و purge با release immutable (ترجیحاً بدون purge)؛
- private Store media با reference Catalog media ادغام نشود.

## 24. برنامه اجرای مرحله‌ای

1. telemetry و تصمیم‌های policy؛ dataset واقعی و media size را اندازه‌گیری کنید.
2. pagination/virtualization/lazy loader را بدون family download تحویل دهید.
3. family registry و reference asset model/publication tool را بسازید.
4. manifest V1 و server-local immutable serving را فعال کنید.
5. automatic OPFS cache و dedupe را rollout کنید.
6. family download journal/UI با pause/resume/quota اضافه کنید.
7. full Catalog opt-in، retention/cleanup و recovery drill.
8. load test و سپس CDN pilot با asset-origin config.

هر مرحله feature flag، backward compatibility، migration rollback و telemetry acceptance criteria داشته باشد.

## 25. آزمون‌های ضروری

- contract: manifest deterministic، hash/size/version، malformed/partial publish.
- unit: queue priority، dedupe، retry/backoff، pause/resume، quota error، account switch.
- integration: OPFS temp/finalize، storage eviction simulation، overlapping families، cleanup reference count.
- API/security: Store isolation private media، admin publication، traversal، MIME spoof، hash mismatch.
- UI: 1k/5k/10k metadata با virtual grid؛ viewport request count؛ cancellation و Blob URL cleanup.
- offline E2E: app update، family کامل/ناقص، storage cleared، reconnect/diff update.
- backend load: manifest and file throughput، DB query count، authorization strategy، disk failure.
- device matrix: Chrome/Edge Android/Desktop و Safari/iOS واقعی؛ OPFS/persistence/quota.

تست‌های موجود media در `tests/unit/media-transfer.test.ts`, `tests/unit/media-recovery.test.ts`, `tests/e2e/media-recovery-real.spec.ts` و `backend/tests/test_media.py` نقطه شروع‌اند، اما Catalog reference را پوشش نمی‌دهند. در این ممیزی benchmark اجرا نشد، چون dataset و محیط production-equivalent موجود نبود.

## 26. پرسش‌ها و اطلاعات مفقود

1. میانگین/p95 حجم و ابعاد تصاویر، تعداد تصویر یکتا و overlap خانواده‌ها چیست؟
2. منابع واقعی سرور، bandwidth، disk/IOPS، reverse proxy، HTTP version و compression چیست؟
3. reference images عمومی‌اند یا نیاز به entitlement/signed access دارند؟
4. family taxonomy و owner انتشار چه کسی است و lifecycle حذف/rename چیست؟
5. آیا یک Catalog محصول چند family و چند variant/image خواهد داشت؟
6. scope cache باید installation-wide باشد یا actor+store؟ اصل partition پروژه actor+store را ایمن‌تر می‌کند، ولی reference عمومی امکان reuse device-wide دارد و نیازمند تصمیم امنیت/حریم خصوصی است.
7. حد فضای مجاز، safety margin و سیاست eviction/pin چیست؟
8. browser/deviceهای پشتیبانی‌شده و حداقل نسخه iOS چیست؟
9. آیا deployment فعلی media durable mount و backup دارد؟ از Repository قابل تأیید نیست.
10. retention releaseهای قدیمی و rollback window چند روز است؟

## Implementation Decision Inputs

- **فایل‌های محتمل برای اصلاح:** `backend/app/models.py`, `backend/app/schemas.py`, router/repository/serviceهای Catalog، `backend/app/config.py`, `backend/app/main.py`, Alembic؛ در frontend `src/features/setting/api/catalogs.api.ts`, types/mutations/UI Catalog، `src/shared/lib/infrastructure/storage/db.ts`, `public/sw.js` فقط در صورت policy جدید، و route/settings navigation. فایل‌های جدید reference media بر فایل private فعلی ترجیح دارند.
- **ماژول‌های قابل reuse:** WebP validation/processing، `storageQuotaService`، الگوی OPFS repository، SHA-256 verification، account assertions، Web Locks، retry/backoff و UI notification. `mediaRecoveryService` الگو است، نه manager نهایی.
- **اجزای جدید:** Family Registry، Reference Asset Registry، Catalog Publication Tool/Job، immutable Manifest Service، Asset Origin Resolver، viewport loader، OPFS reference store/index، persistent Download Manager و settings page.
- **Migration:** بله، برای registry/association/asset/release در طرح توصیه‌شده. Dexie schema migration نیز لازم است. Migration فعلی اجرا نشود تا contract نهایی تصویب شود.
- **تغییر مدل Catalog:** فیلد تخصصی قطعه لازم نیست؛ رابطه family و reference asset/variant لازم است. چندتصویری بودن باید پیش از schema نهایی تصمیم‌گیری شود.
- **Sync:** outbox عملیاتی تغییر معنایی نکند؛ Catalog release metadata می‌تواند inbound refresh مستقل داشته باشد و bulk download هرگز outbox user نباشد.
- **نگهداری reference image:** bytes content-addressed در durable object/filesystem و client OPFS؛ metadata/hash/version در DB/manifest. private Store media جدا.
- **تولید Manifest:** در زمان publication Catalog، با tool/job مستقل، deterministic، validate شده و atomic؛ نه در application build و نه query زنده per request.
- **دانلود خانواده‌ای:** manifest diff → deduped low-priority per-file queue → temp write → hash verify → atomic finalize → pin/reference update؛ concurrency configurable، pause/resume و quota preflight.
- **محدودیت‌های واقعی:** API بدون pagination، Catalog UI eager، family identity موجود نیست، thumbnail واقعی نیست، OPFS local hash-addressed نیست، server deployment/proxy telemetry مفقود است.
- **تصمیم‌های باز پیش از پیاده‌سازی:** access policy عمومی/خصوصی، cache scope، variant sizes/quality، family taxonomy، multi-image cardinality، storage budgets/eviction، manifest signing، release retention، CDN URL policy و browser support matrix.
