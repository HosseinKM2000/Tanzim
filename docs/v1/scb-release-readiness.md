# آمادگی انتشار TZ-V1-SCB

وضعیت این سند: **زیرساخت پیاده‌سازی و با rollout gate ایزوله شده است؛ فعال‌سازی مشتری و merge به `draft` مجاز نیست.**

معنای وضعیت‌ها: `PASS` یعنی شاهد خودکار موجود و اجراشده؛ `BLOCKED` یعنی مسیر عمداً غیرفعال است یا شاهد الزامی/تصمیم قرارداد کم است؛ `NOT RUN` فقط برای بررسی محیطی/فیزیکی؛ `N/A` فقط برای variant مستقلِ ناموجود.

## ماتریس پذیرش

| ID | وضعیت | شاهد یا دلیل دقیق |
|---|---|---|
| REF-01 | PASS | validator بسته؛ `test_migration_reaches_head_with_all_expected_tables` شمار 24/281/25/256 را روی PostgreSQL واقعی کنترل می‌کند. |
| REF-02 | PASS | seed داخل migration و uniqueهای reference؛ اجرای upgrade واقعی و بازاجرای Alembic no-op؛ هیچ inventory در seed ساخته نمی‌شود. |
| REF-03 | PASS | `test_adoption_gates_reference_data_and_preserves_barcode_reservations`: حوزه 02 هیچ proposedی از API نمی‌دهد؛ backend فقط `approved` را provision می‌کند. |
| REF-04 | PASS | `test_custom_category_deactivation_preserves_products_and_can_reactivate`: custom بدون کپی proposal ساخته می‌شود. |
| REF-05 | BLOCKED | UI جست‌وجوی examples برای راهنمای دسته پیاده نشده؛ adoption خاموش است. |
| AUTH-01 | PASS | store از `CurrentUser` می‌آید؛ تست‌های `test_store_personnel.py`, `test_sync.py` و قیود cross-store در `test_postgresql.py`. |
| AUTH-02 | PASS | suite کامل store/personnel/admin موجود؛ route تازه همان authorization service را استفاده می‌کند. |
| AUTH-03 | PASS | suite entitlement/personnel lease و local access بدون fallback؛ تغییری در این مرز داده نشده است. |
| AUTH-04 | PASS | account guard در edit/bulk preview-confirm، invoice scan/output و sync؛ `invoice-scan-output.test.ts`. |
| CAT-01 | PASS | system category در category API/sync immutable؛ intentهای محصول از validator مشترک عبور می‌کنند. |
| CAT-02 | PASS | code custom پایدار و rename بدون rotation؛ lifecycle deactivate/reactivate در تست backend. |
| CAT-03 | PASS | تست backend اثبات می‌کند deactivate محصول را جدا نمی‌کند و مقصد تازه رد می‌شود. |
| CAT-04 | PASS | create جدید بعد adoption بدون دسته 422؛ patchهای legacy در regression sync حفظ شده‌اند. |
| CAT-05 | PASS | `validate_category_for_new_intent` store/sector/active/approved را fail-closed بررسی می‌کند؛ قیود FK/unique migration. |
| CAT-06 | PASS | signup regression کامل و adoption transaction؛ هویت signup تغییر نکرده است. rollout gate هنوز خاموش است. |
| SEC-01 | PASS | marker `has_historical_inventory_usage` در migration و delete/catalog provisioning پایدار می‌شود؛ legacy adoption review را دور نمی‌زند. |
| SEC-02 | BLOCKED | row-lock مشترک در کد وجود دارد، اما race واقعی first-create/adoption در PostgreSQL هنوز شاهد اختصاصی ندارد. |
| SEC-03 | BLOCKED | server fence و local block موجود است؛ سناریوی دستگاه stale انتهابه‌انتها اجرا نشده است. |
| BC-01 | PASS | تست backend و `barcode-domain.test.ts`/`invoice-scan-output.test.ts` مقدار exact، صفر آغازین، case و فاصله را حفظ می‌کنند. |
| BC-02 | PASS | transport terminator جدا و validation ASCII/checksum روشن در frontend/backend. |
| BC-03 | PASS | `inventory.service.test.ts` انتخاب durable قبل dispatch، ID ثابت و atomic Solo/Team را بررسی می‌کند؛ backend replay همان payload. |
| BC-04 | PASS | unique `(store_id,value)` روی reservation شامل retired/deleted؛ same-target retry idempotent؛ suite PostgreSQL schema را نصب می‌کند. |
| BC-05 | PASS | uniqueness store-scoped و resolver همیشه store عضویت جاری را filter می‌کند؛ cross-store constraints موجود. |
| BC-06 | PASS | rotation فقط confirm recategorization است؛ patch نام/قیمت/brand/image مسیر barcode را فراخوانی نمی‌کند و regression inventory سبز است. |
| BC-07 | BLOCKED | custom code آفلاین پایدار است، ولی سناریوی واقعی dependent category+product از IndexedDB تا backend شاهد اختصاصی ندارد. |
| BC-08 | PASS | collision به conflict/recovery می‌رود؛ هیچ renumber/rebind خودکار در client یا server وجود ندارد. |
| BC-09 | PASS | renderer escape HTML می‌کند و unsupported/overlong را بدون تغییر مقدار رد می‌کند؛ `label-renderer.test.ts`. |
| MOVE-01 | BLOCKED | UI confirmation نوشته شده، ولی تست transaction برای cancel تکی و mixed که صفر write/outbox را اثبات کند موجود نیست. |
| MOVE-02 | PASS | confirm یک transaction server، operation fingerprint و same-ID replay دارد؛ backend lifecycle test. |
| MOVE-03 | PASS | external alias دست‌نخورده و internalهای فعال retired/replaced؛ backend lifecycle test. |
| MOVE-04 | PASS | reservation retired قابل احیا نیست و rename مسیر صدور ندارد؛ validation server fail-closed است. |
| MOVE-05 | BLOCKED | product/store locks وجود دارند، اما race دو recategorization روی PostgreSQL واقعی اجرا نشده است. |
| MOVE-06 | PASS | token HMAC به target/version/count/destination/expiry مقید و stale snapshot با 409 رد می‌شود؛ UI preview را دوباره می‌خواهد. |
| MOVE-07 | BLOCKED | edit و bulk به service مشترک وصل‌اند؛ import/catalog override/restore برای recategorization یکپارچه نشده‌اند. |
| MOVE-08 | BLOCKED | transaction rollback ذاتی است، اما fault injection بین retire و issue روی PostgreSQL اجرا نشده است. |
| MOVE-09 | N/A | هیچ مدل variant مستقل در مدل‌ها/schema/Dexie وجود ندارد؛ سند معماری مسیرهای منبع را ثبت کرده است. |
| MODE-01 | PASS | Solo product+barcode+outbox در `localMutationStorage.inventoryWithBarcodes` یک Dexie transaction است؛ `inventory.service.test.ts`. |
| MODE-02 | PASS | Team create barcode projection خوش‌بینانه ندارد؛ offline از team command service رد می‌شود؛ regression موجود. |
| MODE-03 | PASS | suite sync/replay و `sync-resolution-real.spec.ts` همان ID/fingerprint و late resolution را پوشش می‌دهند. |
| MODE-04 | PASS | conditional rollback/successor logic suite sync client موجود و بدون تغییر حفظ شده است. |
| MODE-05 | PASS | attempted/unknown/renewal regressionهای فاز 09B و read-only resolution حفظ شده‌اند. |
| SCAN-01 | PASS | resolver retired را جدا می‌کند؛ invoice test صفر effect و scanner page هیچ pending movement برای retired نمی‌سازد. |
| SCAN-02 | PASS | resolver exact و ambiguity fail-closed؛ `invoice-scan-output.test.ts`. |
| SCAN-03 | PASS | callback dedupe/camera close/account guard در scanner component regression موجود. |
| SCAN-04 | PASS | movement پذیرش server barcode id/value/lifecycle را دوباره بررسی می‌کند؛ stale intent رد می‌شود. |
| SCAN-05 | PASS | invoice capability مستقل از barcode lookup؛ `invoice-scan-output.test.ts` و invoice browser regression. |
| PRINT-01 | BLOCKED | longest custom internal = 48 chars و روی هر دو profile موجود `validateLabelFit` شکست ایمن می‌دهد؛ تصمیم symbology/profile لازم است. |
| PRINT-02 | PASS | Team پیش از acceptance barcode project نمی‌کند؛ Solo pending state در output snapshot مشخص است؛ invoice output test. |
| PRINT-03 | NOT RUN | scanner/camera/printer فیزیکی در محیط موجود نیست. |
| MIG-01 | PASS | migration rehearsal واقعی PostgreSQL از revisionهای قدیمی تا head؛ ID/value/quantity/prices/history/fingerprint و reference counts حفظ شده‌اند. |
| MIG-02 | PASS | preflight/rollback fixtureهای ambiguous catalog، owner و phone در `test_postgresql.py`؛ schema/data پس از شکست حفظ می‌شود. |
| MIG-03 | PASS | legacy category/uncategorized/origin بدون inference حفظ می‌شود؛ migration evidence و service compatibility. |
| MIG-04 | PASS | fingerprint عملیات committed قدیمی حفظ و replay می‌شود؛ intent تازهٔ ناسازگار از validator adoption عبور نمی‌کند. |
| REC-01 | PASS | backup schema 6 و reader 1..6؛ authority جزو envelope نیست؛ backup suites. |
| REC-02 | PASS | current-over-import بر ID و resolver ambiguity مانع resurrection/rebind خاموش است؛ sync server reservation را authoritative می‌داند. |
| REC-03 | PASS | backup/restore unit و browser suite quota/restart/staging/apply/discard را پوشش می‌دهند. |
| SYNC-01 | PASS | barcode/category snapshots partitioned، pending successor guard و sync changes recategorization؛ sync suites. |
| SYNC-02 | PASS | catalog reconcile concurrency/capacity در `test_postgresql.py`; overrides و inventory record موجود حفظ می‌شوند. |
| PWA-01 | PASS | Dexie version عوض نشده؛ `local-database-upgrade.test.ts` و real PWA harness داده/صف را حفظ می‌کنند. |
| PWA-02 | PASS | contract محلی schema تازه‌ای ندارد؛ `pwa-update-real.spec.ts` همان two-build harness موجود است. |
| UX-01 | BLOCKED | warning/gate و RTL ساخته شده‌اند؛ production-preview مرورگر برای UI تازهٔ taxonomy/recategorization هنوز شاهد کامل desktop/mobile و دو theme ندارد. |
| REG-01 | PASS | frontend/backend کامل، typecheck/lint/build و focused browser suite باید در بخش اجرای نهایی همین سند سبز ثبت شوند. |

## گیت انتشار و تصمیم باز

`TAXONOMY_ADOPTION_ENABLED` باید در همهٔ محیط‌ها `false` بماند. فعال‌کردن آن فقط پس از این موارد مجاز است:

1. تصمیم تأییدشده دربارهٔ حفظ Code 128 با profile عریض‌تر یا تغییر symbology داخلی؛
2. PASS شدن PRINT-01 و آزمون تصویر encode/decode برای طول نهایی؛
3. آزمون‌های race واقعی SEC-02 و MOVE-05 و fault injection MOVE-08؛
4. مرورگر production-preview برای create، leading-zero، cancel/confirm recategorization، retired scan و label output؛
5. تست فیزیکی چاپ/اسکن یا ثبت صریح پذیرش عملیاتیِ باقی‌ماندن آن به‌عنوان blocker rollout.

تا آن زمان این کد «زیرساخت gated» است، نه «آمادهٔ مشتری».

## اجرای نهایی ۱۴۰۵/۰۸/۲۵ (2026-11-16)

| کنترل | نتیجه |
|---|---|
| validator بستهٔ v1.1 | PASS؛ 24 sector، 281 category، 25 approved، 256 proposed-disabled و 62 scenario؛ همهٔ hashهای manifest مطابق. |
| `npm.cmd test` | PASS؛ 89 فایل و 412 تست frontend/component. |
| `npm.cmd run test:backend` | PASS؛ 104 تست backend بدون suite جداگانهٔ PostgreSQL. |
| `npm.cmd run test:backend:postgres:local` | PASS؛ 19 تست روی PostgreSQL 18.6 محلی و دیتابیس ایزولهٔ `tanzim_test`. |
| `npm.cmd run test:typecheck` | PASS؛ exit 0. |
| `npm.cmd run lint` | PASS؛ exit 0. |
| `npm.cmd run build` | PASS؛ production build با Vite 8.0.16. هشدار اندازهٔ chunk و browserslist موجود است و failure نیست. |
| Playwright production preview | PASS؛ 8 journey در chromium desktop/mobile: invoice layout، hardware-input scan بدون اثر جانبی، PDF آفلاین، backup/restore review و barcode empty-state. |
| focused exact external regression | PASS؛ 2 تست backend taxonomy/lifecycle، شامل حفظ فاصله/case/leading zero و عدم exact-match پس از trim. |
| `git diff --check` | PASS؛ خروجی خالی. |
| تجهیزات فیزیکی | NOT RUN؛ scanner/camera/printer در محیط موجود نبود. |

مرز شواهد: PostgreSQL واقعی محلی و مرورگر Chromium واقعی استفاده شد، ولی APIهای journey مرورگر focused با fixture مصنوعی mock شده‌اند. app-to-backend واقعی برای migration/lifecycle در TestClient و PostgreSQL suite اجرا شده، نه در همان Playwright process. هیچ تستی روی داده یا حساب مشتری اجرا نشده است.
