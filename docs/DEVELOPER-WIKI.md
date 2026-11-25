# دانشنامه و راهنمای جامع توسعه‌دهندگان (Developer Wiki — Tanzim & Parsin CMS)

این مستند مرجع فنی کامل برای توسعه‌دهندگان، عملیات (DevOps) و نگهداری اکوسیستم **تنظیم (`tanzimapp.ir` / `app.tanzimapp.ir`)** و **سیستم یکپارچه مدیریت محتوا و سئوی ۶ برند (`parsin-cms`)** روی سرور `103.75.199.135` است.

---

## ۱. نقشه سرویس‌ها و پورت‌ها روی سرور (`103.75.199.135`)

| سرویس | دامنه عمومی | پورت داخلی | مسیر روی سرور | سرویس `systemd` / Docker |
| :--- | :--- | :--- | :--- | :--- |
| **فرانت‌اند اپ تنظیم (PWA)** | `https://app.tanzimapp.ir` | Apache 443 | `/soft/tanzimapp.ir/app` | `apache2.service` |
| **بک‌اند اپ تنظیم (FastAPI)** | `https://app.tanzimapp.ir/api` | `127.0.0.1:8012` | `/soft/st.parsindade.com/backend` | `stock-inventory.service` |
| **دیتابیس تنظیم (PostgreSQL)** | — | `127.0.0.1:5434` | کانتینر `tanzim-db` | Docker `tanzim-db` |
| **لندینگ و وبلاگ تنظیم** | `https://tanzimapp.ir` | Apache 443 | `/soft/tanzimapp.ir/site` | `apache2.service` |
| **پنل مرکزی محتوا (Payload)** | `https://parsindade.com/cms` | `127.0.0.1:3011` | `/soft/parsin-cms` | `parsin-cms.service` |
| **ایجنت AI و ربات تلگرام** | `@myParsin_bot` | — | `/soft/parsin-cms-agent` | `parsin-cms-bot.service` |
| **پل پیام‌رسان `telewhat`** | — | `127.0.0.1:8100` | `/soft/telewhat-instagram` | سرویس Python روی 8100 |
| **سرویس DongiGPT و DongiPay** | `api.chat.dongigpt.ir` / `pdongi.ir` | `127.0.0.1:8031` | `/soft/chat.dongigpt.ir/backend` | `dongigpt-api.service` |

---

## ۲. معماری فرانت‌اند و IndexedDB (`Stock-Inventory-React-`)

### ۲.۱. ساختار پوشه‌ها
- `src/routes/`: مسیرهای فایل‌بیس TanStack Router (`(app)/dashboard`, `setting/subscription`, `tools/scanner`, `tools/invoices`, ...)
- `src/features/`: ماژول‌های دامنه (`app/dashboard`, `app/inventory`, `invoices`, `counterparties`, `personnel`, `backup`, `setting`)
- `src/shared/api/client.ts`: کلاینت مرکزی HTTP (`apiFetch`) با ارسال هدرهای `X-Request-ID`, `X-Device-Fingerprint`, `X-Client-Data-Schema: 3` و علامت‌گذاری خودکار آنلاین بودن (`networkService.markOnline()`).
- `src/shared/lib/infrastructure/storage/db.ts`: دیتابیس آفلاین Dexie (`tanzim-db-v2`).
  - **نکته حیاتی IndexedDB:** در Chromium/IndexedDB تغییر کلید اصلی (Primary Key) یک جدول موجود باعث خطای `UpgradeError: Not yet support for changing primary key` می‌شود. به همین دلیل در `db.ts` تمامی نسخه‌های ۱ تا ۱۴ روی کلید اصلی `local_key` (`${actor}:${store}:${id}`) یکسان‌سازی شده‌اند و دیتابیس به `tanzim-db-v2` منتقل شده است تا هیچ مرورگری دچار خطای ارتقای کلید اصلی نشود.

### ۲.۲. دستورات توسعه و بیلد فرانت‌اند
```powershell
# نصب وابستگی‌ها
npm ci

# اجرای محیط توسعه
npm run dev

# اجرای تست‌ها و بررسی تایپ
npm run test
npm run test:typecheck

# بیلد پروداکشن (حتماً با VITE_API_URL=/api)
$env:VITE_API_URL="/api"; npm run build
```

---

## ۳. معماری بک‌اند (`backend/`)

### ۳.۱. ماژول‌های کلیدی
- `backend/app/config.py`: تنظیمات محیطی (`DATABASE_URL`, `DATABASE_SCHEMA_VERSION = "20261115_0019"`, `DONGIPAY_BASE_URL`, `DONGIPAY_TOKEN`, `TELEWHAT_RELAY_URL`, `TELEWHAT_TG_TARGET`).
- `backend/app/plans.py`: تعریف متمرکز طرح‌ها در `PLAN_CATALOG`:
  - `free` (رایگان — ۰ تومان)
  - `personal` (پلاس — ۹۹۵٬۰۰۰ تومان، ماه اول ۵۵۵٬۰۰۰ تومان)
  - `pro` (پرو — ۲٬۴۹۰٬۰۰۰ تومان، ماه اول ۱٬۸۵۰٬۰۰۰ تومان)
  - `vip` (بیزینس — ۴٬۹۵۰٬۰۰۰ تومان، ماه اول ۳٬۸۵۰٬۰۰۰ تومان)
- `backend/app/services/dongipay_service.py` و `backend/app/routers/plans.py`:
  - `GET /api/plans/checkout-status`: بررسی فعال بودن درگاه و واجد شرایط بودن تخفیف ماه اول (`is_first_month_eligible`).
  - `POST /api/plans/{plan_id}/checkout`: ثبت رکورد در `subscription_payments` و دریافت لینک پرداخت از `POST /api/v1/dongipay/payments`.
  - `POST /api/plans/payments/verify`: تایید پرداخت با `POST /api/v1/dongipay/payments/{dp_id}/verify` و ثبت `StorePlanGrant` سی‌روزه.
- `backend/app/services/logging_service.py` و `backend/app/routers/logs.py`:
  - ذخیره لاگ‌های سرور و کلاینت (`POST /api/logs/client`) در جدول `app_logs` و ارسال غیرمسدودکننده هشدارها به تلگرام (`09192472218`) از طریق `telewhat`.

### ۳.۲. بررسی لاگ‌ها و دیتابیس روی سرور
```bash
# وضعیت سرویس بک‌اند
systemctl status stock-inventory.service
journalctl -u stock-inventory.service -n 50 --no-pager

# مشاهده آخرین لاگ‌های ثبت‌شده در دیتابیس
docker exec tanzim-db psql -U tanzim_app -d tanzim -c \
  "SELECT id, created_at, level, source, event, path, status_code, message FROM app_logs ORDER BY id DESC LIMIT 20;"
```

---

## ۴. سیستم یکپارچه محتوا و سئو (`parsin-cms` + `@myParsin_bot`)

### ۴.۱. کالکشن‌ها و مسیرها در `/soft/parsin-cms`
- `src/collections/Brands.ts`: مدیریت ۶ برند (`parsindade`, `tanzim`, `shagerd`, `biabashka`, `dongigpt`, `zhipono`).
- `src/collections/Keywords.ts`: بانک کلمات کلیدی سئو و صف تولید محتوا.
- `src/collections/Posts.ts`: مقالات چندبرندی همراه با محاسبه خودکار `seoScore` و `seoAuditNotes` در هوک `beforeChange` (`src/lib/seo-audit.ts`) و نمایش تاریخ شمسی (`JalaliDateCell.tsx` و `JalaliDateBadge.tsx`).
- **APIهای عمومی و داشبورد:**
  - `GET /cms/api/public/articles?brand=<slug>&limit=100`
  - `GET /cms/api/seo/overview`
  - `POST /cms/api/agent/run` (اجرای دستی ایجنت تولید مقاله یا صف انتشار از داخل داشبورد)
  - `POST /cms/api/auth/telegram-otp` (ارسال و تایید کد ورود تلگرامی از طریق `@myParsin_bot`)

### ۴.۲. بیلد و ری‌استارت `parsin-cms`
```bash
cd /soft/parsin-cms
set -a; source .env; set +a
npm run generate:importmap
npm run generate:types
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
chown -R svc-parsincms:svc-parsincms /soft/parsin-cms/data /soft/parsin-cms/.next/standalone/.next/cache
systemctl restart parsin-cms.service
```

### ۴.۳. ایجنت هوش مصنوعی و زمان‌بندها (`/soft/parsin-cms-agent`)
- `cms_agent.py --bot` (`parsin-cms-bot.service`): ربات `@myParsin_bot` برای دریافت دستورهای `/generate`, `/status`, `/publish_due`، دکمه‌های تایید/انتشار، تولید کپشن توییتر و اینستاگرام، و ویرایش تعاملی مقاله با مدل‌های رایگان دونگی جی‌پی‌تی (`oc-deepseek-v4.1-free`, `oc-glm-5.3-free`, `oc-mimo-v2.6-free`).
- `parsin-cms-daily.timer`: اجرای روزانه تولید مقاله در ساعت ۰۸:۳۰ صبح به وقت تهران.
- `parsin-cms-scheduler.timer`: بررسی ۵ دقیقه‌ای صف انتشار و همگام‌سازی با سایت‌های مقصد (`sync_sites.py`).
