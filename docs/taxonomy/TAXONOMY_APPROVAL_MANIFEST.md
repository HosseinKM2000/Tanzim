# Canonical Taxonomy — Approval Manifest (QA proposal v2)

Status: **DRAFT / QA-ONLY — pending product-owner approval. Nothing here is publicly activated.**
Date: 2026-11-22
Branch: `feat/canonical-taxonomy-all-sectors-v1`

## 1. Artifact identity

| Field | Value |
|---|---|
| Proposal version | `scb-2026-11-20-v2-proposed-qa` |
| Parent / official version | `scb-2026-11-14-v1` (unchanged) |
| Dataset | `backend/app/reference_data/tanzim_sector_categories_v2_proposed_qa.json` |
| Schema version | `2.0.0` |
| File SHA-256 (raw bytes) | `e706f8f860b351e6bcf095ad071df5dc63716be148c8d568f6b990857f4201ff` |
| Canonical JSON SHA-256 (seed identity) | `cde53774b6591347b10ee60c7c490353b6aa55359fddb7854475806805776ba2` |
| Sectors | 24 |
| Parent categories | 362 (v1: 281, +81 new) |
| Approved | 25 (only sector 01 automotive) |
| Proposed | 337 (all other sectors) |

Runtime contract in the dataset:

- `proposed_categories_default_enabled: false`
- `qa_only_activation: true`
- `qa_activation_requires_environment: qa`
- `qa_activation_flag: QA_PROPOSED_TAXONOMY_ENABLED`
- `approval_owner: product_owner`
- `codes_preserved_from: scb-2026-11-14-v1`
- `max_categories_per_sector: 99`

## 2. What this manifest authorizes and what it does not

Authorized (QA/test only, disposable database):

- Loading the proposed dataset through the existing canonical seeder when **all** of these hold:
  `ENVIRONMENT in {qa, test}`, `TAXONOMY_VERSION_OVERRIDE=scb-2026-11-20-v2-proposed-qa`,
  `QA_PROPOSED_TAXONOMY_ENABLED=1`.
- Showing proposed categories in the QA category picker and adopting them into QA-only stores.

Not authorized:

- Publishing or activating any `proposed` category in development or production.
- Changing the official `scb-2026-11-14-v1` file, its content hash, or its 281/25/256 counts.
- Renumbering existing codes, reusing retired codes, or changing the `TZ1` barcode contract.
- Using one database for both v1 and v2 (unique `reference_sectors.code` /
  `reference_categories.id` make that a fail-closed conflict by design).

## 3. Invariants preserved

| Invariant | Evidence |
|---|---|
| Sector codes 01–24 unchanged | `test_taxonomy_proposed_qa.py::test_v2_preserves_every_v1_code_and_name` |
| Existing category codes and names unchanged | same test, per-code comparison against v1 |
| 25 automotive categories stay `approved` and byte-identical | dataset test asserts codes 01–25 all approved |
| All new categories are `proposed` | dataset test asserts statuses ∈ {approved, proposed} and totals 25/337 |
| No code reuse / no renumbering | new codes always `max(code)+1`, sector 24 continues at 02–08 |
| Code capacity | max code per sector ≤ 25, hard cap 99 (`sector*100+code` ID scheme) |
| Barcode contract | `TZ1` issuance untouched; barcode tests pass (`test_taxonomy_barcode_lifecycle.py`) |
| Seed identity | `CanonicalTaxonomySeed` row per version with content hash + count guard |

## 4. Per-sector totals

`v1` = categories in the official version, `new` = proposed additions.
Capacity = 99 − highest used code.

| Sector | Title | v1 | Total | New | Approved | Proposed | Capacity |
|---|---|---|---|---|---|---|---|
| 01 | قطعات، لوازم و تجهیزات خودرو | 25 | 25 | 0 | 25 | 0 | 74 |
| 02 | ابزارآلات و تجهیزات صنعتی | 12 | 22 | 10 | 0 | 22 | 77 |
| 03 | برق، روشنایی و تجهیزات الکتریکی | 12 | 15 | 3 | 0 | 15 | 84 |
| 04 | تأسیسات و تجهیزات ساختمانی | 12 | 16 | 4 | 0 | 16 | 83 |
| 05 | یراق‌آلات، پیچ و اتصالات | 11 | 13 | 2 | 0 | 13 | 86 |
| 06 | مصالح و ملزومات ساختمانی | 12 | 15 | 3 | 0 | 15 | 84 |
| 07 | موبایل و لوازم جانبی | 10 | 17 | 7 | 0 | 17 | 82 |
| 08 | کامپیوتر و تجهیزات شبکه | 12 | 16 | 4 | 0 | 16 | 83 |
| 09 | لوازم الکترونیکی و دیجیتال | 11 | 14 | 3 | 0 | 14 | 85 |
| 10 | لوازم خانگی و قطعات | 12 | 14 | 2 | 0 | 14 | 85 |
| 11 | پوشاک، کیف، کفش و محصولات چرمی | 12 | 15 | 3 | 0 | 15 | 84 |
| 12 | پارچه، خرازی و ملزومات دوخت | 11 | 14 | 3 | 0 | 14 | 85 |
| 13 | آرایشی، بهداشتی و مراقبتی | 12 | 15 | 3 | 0 | 15 | 84 |
| 14 | مواد غذایی و محصولات سوپرمارکتی | 14 | 17 | 3 | 0 | 17 | 82 |
| 15 | لوازم تحریر، کتاب و ملزومات اداری | 10 | 13 | 3 | 0 | 13 | 86 |
| 16 | لوازم منزل، دکوراسیون و آشپزخانه | 12 | 14 | 2 | 0 | 14 | 85 |
| 17 | مبلمان و صنایع چوبی | 11 | 13 | 2 | 0 | 13 | 86 |
| 18 | ورزش، بدنسازی و تجهیزات تفریحی | 12 | 16 | 4 | 0 | 16 | 83 |
| 19 | اسباب‌بازی، کودک و سرگرمی | 12 | 15 | 3 | 0 | 15 | 84 |
| 20 | کشاورزی، باغبانی و دامپروری | 12 | 14 | 2 | 0 | 14 | 85 |
| 21 | تجهیزات پزشکی و آزمایشگاهی | 11 | 13 | 2 | 0 | 13 | 86 |
| 22 | طلا، زیورآلات و اکسسوری | 10 | 13 | 3 | 0 | 13 | 86 |
| 23 | قطعات و تجهیزات ماشین‌آلات | 12 | 15 | 3 | 0 | 15 | 84 |
| 24 | سایر کالاها و کسب‌وکارها | 1 | 8 | 7 | 0 | 8 | 91 |

## 5. New proposed categories (81)

Every line below has `approval_status = proposed`, `origin = system`, `level = 1`,
`reference_key = category:<sector>:<code>` and 4 example products in `examples_fa`.

### 01 — قطعات، لوازم و تجهیزات خودرو (0 new / 25 total)

No additions. The automotive contract (25 approved codes 01–25) is unchanged.

### 02 — ابزارآلات و تجهیزات صنعتی (10 new / 22 total)
- `02-13` **ابزار نجاری و چوب** — اره دستی، رنده چوب، اسکنه، گیره نجاری
- `02-14` **ابزار لوله‌کشی و تأسیسات** — آچار لوله‌گیر، پرس لوله، لوله‌بر، شابلون لوله
- `02-15` **ابزار باغبانی و فضای سبز** — بیل، شن‌کش، قیچی باغبانی، ماشین چمن‌زنی
- `02-16` **ابزار برقی صنعتی سنگین** — دریل ستونی، فرز بزرگ، پرس هیدرولیک، اره نواری
- `02-17` **کمپرسور و هوای فشرده** — کمپرسور، مخزن هوا، درایر، شیر فشار
- `02-18` **پمپ و تجهیزات سیال کارگاهی** — پمپ آب، پمپ گریس، پمپ تخلیه، شیلنگ فشار قوی
- `02-19` **تجهیزات رنگ‌آمیزی و پاشش** — پیستوله، رنگ صنعتی، تینر، نازل
- `02-20` **تجهیزات تست و عیب‌یابی** — مولتی‌متر، تستر کابل، تستر باتری، ترموویژن
- `02-21` **ماشین‌آلات کوچک کارگاهی** — اره رومیزی، سنگ رومیزی، خم‌کن، پرس دستی
- `02-22` **تجهیزات نظافت صنعتی** — واترجت، جاروبرقی صنعتی، اسکرابر، شوینده صنعتی

### 03 — برق، روشنایی و تجهیزات الکتریکی (3 new / 15 total)
- `03-13` **ترانس، بالاست و درایور** — ترانس، بالاست، درایور LED، استارتر
- `03-14` **روشنایی هوشمند** — کلید هوشمند، سنسور حضور، دیمر، کنترل
- `03-15` **شارژر خودرو برقی و تجهیزات EV** — شارژر دیواری، کابل شارژ خودرو، ایستگاه شارژ، آداپتور شارژ

### 04 — تأسیسات و تجهیزات ساختمانی (4 new / 16 total)
- `04-13` **تجهیزات گاز** — شیر گاز، رگولاتور، دتکتور گاز، لوله گاز
- `04-14` **آبیاری فضای سبز** — قطره‌چکان، شلنگ آبیاری، شیر آبیاری، اسپرینکلر
- `04-15` **اطفای حریق ساختمان** — اسپرینکلر، کپسول آتش‌نشانی، شیلنگ آتش‌نشانی، دتکتور
- `04-16` **استخر و جکوزی** — تجهیزات استخر، پمپ استخر، فیلتر استخر، کلرزن

### 05 — یراق‌آلات، پیچ و اتصالات (2 new / 13 total)
- `05-12` **قفل و سیستم امنیتی** — قفل دیجیتال، قفل پدالی، قفل آویز، قفل رمزی
- `05-13` **اتصالات لوله‌ای و شیلنگ** — بست شیلنگ، اتصال لوله، سه‌راهی، شیر

### 06 — مصالح و ملزومات ساختمانی (3 new / 15 total)
- `06-13` **سنگ ساختمانی** — سنگ نما، مرمریت، گرانیت، سنگ کف
- `06-14` **مصالح پیش‌ساخته** — پانل پیش‌ساخته، تیرچه، بلوک سقفی، دیوار پیش‌ساخته
- `06-15` **مصالح بومی و سنتی** — خشت، کاهگل، آجر نسوز، سنگ لاشه

### 07 — موبایل و لوازم جانبی (7 new / 17 total)
- `07-11` **ساعت هوشمند و پوشیدنی** — ساعت هوشمند، مچ‌بند سلامتی، انگشتر هوشمند، عینک هوشمند
- `07-12` **لوازم جانبی تبلت** — کیبورد تبلت، قلم لمسی، کاور تبلت، پایه تبلت
- `07-13` **مودم و اینترنت همراه** — مودم همراه، روتر سیار، آنتن تقویت، سیم‌کارت داده
- `07-14` **لوازم حفاظتی و ردیاب** — قفل امنیتی، ردیاب، کیف ضدآب، محافظ حریم
- `07-15` **لوازم جانبی خودرویی موبایل** — هولدر خودرو، شارژر فندکی، دوربین داشبورد، کابل شارژ خودرو
- `07-16` **لوازم گیمینگ موبایل** — دسته بازی، خنک‌کننده گوشی، هدست گیمینگ، پایه استریم
- `07-17` **کیف و کوله دیجیتال** — کوله لپ‌تاپ، کیف تبلت، کیف دوربین، محفظه سخت

### 08 — کامپیوتر و تجهیزات شبکه (4 new / 16 total)
- `08-13` **چاپگر و مصرفی** — پرینتر، اسکنر، کارتریج، تونر
- `08-14` **لوازم گیمینگ** — کیبورد گیمینگ، ماوس گیمینگ، هدست گیمینگ، صندلی گیمینگ
- `08-15` **میکروفون و استریم** — میکروفون، کارت صدای خارجی، وبکم، رینگ لایت
- `08-16` **پایه و ارگونومی** — پایه مانیتور، پایه لپ‌تاپ، زیرپایی، تشک ارگونومیک

### 09 — لوازم الکترونیکی و دیجیتال (3 new / 14 total)
- `09-12` **کیف و محافظ تجهیزات** — کیف دوربین، کاور کنسول، محفظه سخت، بند ایمنی
- `09-13` **پایه و نصب تجهیزات** — سه‌پایه، بازوی مانیتور، براکت دیواری، پایه رومیزی
- `09-14` **تجهیزات واقعیت مجازی** — هدست VR، دسته VR، پایه VR، لنز محافظ

### 10 — لوازم خانگی و قطعات (2 new / 14 total)
- `10-13` **لوازم آشپزخانه غیربرقی** — قابلمه، چاقو، تخته برش، ظرف
- `10-14` **بهداشت و مراقبت شخصی** — مسواک برقی، دستگاه بخور، ترمومتر، تصفیه‌کننده شخصی

### 11 — پوشاک، کیف، کفش و محصولات چرمی (3 new / 15 total)
- `11-13` **لباس کار و ایمنی** — لباس کار، کفش ایمنی، دستکش کار، کلاه ایمنی
- `11-14` **پوشاک سنتی و محلی** — لباس محلی، عبا، شال سنتی، گیوه
- `11-15` **لباس بارداری و شیردهی** — مانتو بارداری، لباس شیردهی، شلوار بارداری، بالش شیردهی

### 12 — پارچه، خرازی و ملزومات دوخت (3 new / 14 total)
- `12-12` **پارچه کیف و کفش** — پارچه کیف، پارچه کفش، لایی کیف، آستر کیف
- `12-13` **الگو و آموزش دوخت** — الگوی خیاطی، کتاب دوخت، کاغذ الگو، مقیاس
- `12-14` **تشک و پد دوخت** — تشک اتو، پد کار، زیرپایی چرخ، محافظ میز

### 13 — آرایشی، بهداشتی و مراقبتی (3 new / 15 total)
- `13-13` **محصولات کودک و مادر** — شامپو بچه، پوشک، کرم کودک، پد بهداشتی
- `13-14` **محصولات آقایان** — ادکلن مردانه، محصول اصلاح، مراقبت پوست آقایان، شامپو مردانه
- `13-15` **لوازم بهداشتی سفر** — کیف لوازم بهداشتی، ست سفر، دستمال مرطوب، ضدعفونی‌کننده

### 14 — مواد غذایی و محصولات سوپرمارکتی (3 new / 17 total)
- `14-15` **غذای کودک و مادر** — غذای کودک، شیر خشک، پوره کودک، بیسکویت کودک
- `14-16` **محصولات رژیمی و ارگانیک** — محصول رژیمی، بدون قند، محصول ارگانیک، مکمل غذایی
- `14-17` **محصولات صبحانه** — مربا، عسل، حلوا شکری، کره بادام‌زمینی

### 15 — لوازم تحریر، کتاب و ملزومات اداری (3 new / 13 total)
- `15-11` **کیف و کوله مدرسه** — کوله مدرسه، جامدادی، کیف اداری، مخزن
- `15-12` **مهر و استامپ** — مهر، استامپ، جوهر مهر، پد استامپ
- `15-13` **تخته و وایت‌برد** — وایت‌برد، تخته کلاسی، ماژیک وایت‌برد، پاک‌کن تخته

### 16 — لوازم منزل، دکوراسیون و آشپزخانه (2 new / 14 total)
- `16-13` **ظروف یکبار مصرف** — بشقاب یکبار مصرف، لیوان یکبار مصرف، قاشق یکبار مصرف، ظرف نگهداری
- `16-14` **گل و گیاه آپارتمانی** — گلدان، خاک گلدان، گیاه آپارتمانی، آبپاش

### 17 — مبلمان و صنایع چوبی (2 new / 13 total)
- `17-12` **مبلمان فضای باز** — مبل باغی، میز باغی، صندلی تاشو، پاراسل
- `17-13` **مبلمان کودک** — تخت کودک، میز کودک، صندلی کودک، قفسه کودک

### 18 — ورزش، بدنسازی و تجهیزات تفریحی (4 new / 16 total)
- `18-13` **تجهیزات زمستانی و اسکی** — اسکی، بوت اسکی، عینک اسکی، دستکش اسکی
- `18-14` **ماهیگیری** — چوب ماهیگیری، قرقره ماهیگیری، قلاب، طعمه
- `18-15` **تیراندازی و تیروکمان** — کمان، تیر، هدف تیراندازی، دستکش تیراندازی
- `18-16` **تجهیزات اسب‌سواری** — زین، افسار، چکمه سواری، کلاه سواری

### 19 — اسباب‌بازی، کودک و سرگرمی (3 new / 15 total)
- `19-13` **بازی آبی و استخر** — استخر بادی، اسلحه آب، حلقه شنا، توپ آبی
- `19-14` **کتاب و محصولات آموزشی کودک** — کتاب کودک، فلش‌کارت، کتاب رنگ‌آمیزی، پازل آموزشی
- `19-15` **لوازم جشن و تولد** — بادکنک، شمع تولد، کلاه تولد، ریسه

### 20 — کشاورزی، باغبانی و دامپروری (2 new / 14 total)
- `20-13` **زنبورداری** — کندو، لباس زنبورداری، دودی، قاب عسل
- `20-14` **پرورش آبزیان** — استخر پرورش ماهی، غذای ماهی، پمپ آب، فیلتر آب

### 21 — تجهیزات پزشکی و آزمایشگاهی (2 new / 13 total)
- `21-12` **لوازم بارداری و نوزاد** — پوشک نوزاد، شیشه شیر، پستانک، تشک تعویض
- `21-13` **بهداشت دهان و دندان** — مسواک، خمیردندان، نخ دندان، دهان‌شویه

### 22 — طلا، زیورآلات و اکسسوری (3 new / 13 total)
- `22-11` **نقره و بدلیجات** — نقره، استیل، برنج، بدلی
- `22-12` **سفارشی و تعمیر** — تعمیر طلا، آبکاری، سفارش سفارشی، اندازه‌گیری
- `22-13` **اکسسوری مردانه** — دکمه سردست، گیره کراوات، جاکلیدی، کیف کارت

### 23 — قطعات و تجهیزات ماشین‌آلات (3 new / 15 total)
- `23-13` **روانکار و مصرفی صنعتی** — گریس، روغن صنعتی، مایع خنک‌کننده، تمیزکننده صنعتی
- `23-14` **تجهیزات جوش صنعتی** — دستگاه جوش، الکترود، ماسک جوش، سیم جوش
- `23-15` **بالابر و انتقال صنعتی** — بالابر، نوار نقاله، وینچ، جرثقیل

### 24 — سایر کالاها و کسب‌وکارها (7 new / 8 total)
- `24-02` **بسته‌بندی و ملزومات ارسال** — کارتن، نایلون بسته‌بندی، چسب بسته‌بندی، برچسب
- `24-03` **نظافت و بهداشت عمومی** — شوینده، دستمال، سطل، برس
- `24-04` **ایمنی و حفاظت فردی** — دستکش، ماسک، کلاه ایمنی، عینک ایمنی
- `24-05` **لوازم مصرفی عمومی** — باتری، لامپ، طناب، چسب
- `24-06` **هدیه و سوغات** — هدیه، سوغات، کارت هدیه، بسته هدیه
- `24-07` **لوازم مناسبتی** — شمع، بادکنک، ریسه، تزئین
- `24-08` **کالاهای خیریه و بسته کمک** — بسته کمک، پک اقلام، کالای خیریه، بسته غذایی

## 6. Review checklist for the product owner

For each sector, approve or reject the block above. A sector is publishable only after:

- [ ] Titles are natural Persian and distinguishable for a first-time shopkeeper.
- [ ] No new title duplicates an existing parent in the same sector.
- [ ] Example products are representative of the sector's actual retail assortment.
- [ ] Cross-sector overlaps (see `TAXONOMY_COVERAGE_AUDIT.md` §4) are resolved or accepted.
- [ ] Codes are accepted as-is (no renumbering after publication).
- [ ] The sector really needs `custom_categories_allowed` as currently declared.

Sign-off table (empty until product-owner review):

| Sector | Reviewer | Decision (approve/reject/revise) | Date | Notes |
|---|---|---|---|---|
| 01 | — | already approved in v1 | — | do not modify |
| 02–24 | — | pending | — | QA-only until signed |

## 7. Publication path after approval (out of scope for this task)

1. Copy approved blocks into a new official dataset version (do not edit v1 in place).
2. Update the canonical seeder source selection and the seed identity record.
3. Promote the approved codes from `proposed` to `approved` in the new version.
4. Roll out with the existing adoption flow; no store industry migration, no barcode regeneration.
