# QA blockers and safe unlocks

| ID | Blocker | Class | Cause / evidence | Safe disposition | Status |
|---|---|---|---|---|---|
| QB-01 | «ثبت حوزه‌های جدید… غیرفعال است» | INTENTIONAL_SECURITY | `industry-form.tsx:99-130`; `taxonomy.py:84-96`; flag default off | In isolated QA only, set `TAXONOMY_ADOPTION_ENABLED=true`. UI then removes the blanket warning and enables a selected valid sector. Owner/version/Store/history guards remain. | PASS QA unlock |
| QB-02 | Used Store industry change | PRODUCT_DECISION | `taxonomy_service.py:62-99,159` | Keep `LEGACY_STORE_REVIEW_REQUIRED`. Do not bypass until migration contract below is approved/tested. | BLOCKED |
| QB-03 | Catalog browse/media/offline features | INTENTIONAL_SECURITY | four independent flags default false in `config.py:57-72` | Enable only in isolated QA processes; never change defaults. | PASS QA unlock |
| QB-04 | Physical barcode/camera/printer | HARDWARE_REQUIRED | software encode/render/decode tests only | Execute device matrix and retain photos/logs/readability measurements. | BLOCKED |
| QB-05 | Reference image publication | PRODUCT_DECISION | no real rights evidence | Use synthetic test-use assets only; publication stays denied. | BLOCKED |
| QB-06 | Paid checkout | INCOMPLETE | `plans.py:23-27` provider unavailable | Do not simulate entitlement; test truthful disabled state. | BLOCKED commercial |
| QB-07 | Password recovery/OTP | PRODUCT_DEPENDENCY | Closure A implements a generic request boundary with persistent rate-limit/audit but no verified mobile/email channel exists | Keep `delivery_available=false`; approve and integrate an ownership-verifying provider before any reset credential is issued. No bypass/OTP was added. | PARTIAL / reset BLOCKED |
| QB-08 | Production topology/monitoring/restore | HARDWARE_REQUIRED | no target access/operators | Run Gate 6 operator checklist in target-like environment. | BLOCKED |

## Used-Store industry migration contract proposal

The operation must be owner-only, online-only, version-bound and serialized with all Store writes. A dry-run returns counts/IDs for products, uncategorized and legacy categories, barcode provenance, catalog links, invoices, movements, pending/rejected operations and offline client generations. The approved plan must define deterministic mapping for every category/product, whether old barcodes remain aliases or are retired, and why immutable invoices/movements retain their historical labels and amounts.

Before commit, every active client must sync or be explicitly invalidated; unknown/rejected commands remain recovery evidence and are never rewritten. Commit must preserve stock quantities, invoice snapshots, movement continuity, actor attribution and Store ownership, create a migration audit record, and publish a new taxonomy policy/version. Rollback is allowed only before incompatible client/schema publication, or through an explicit compensating migration that never deletes history. Old clients must receive a version error, not silently write legacy categories.

Required tests: dry-run/no mutation; missing mapping; cross-Store payload; concurrent invoice/stock/barcode writes; pending and terminal outbox states; catalog adoption links; duplicate/internal barcode replacement; transaction rollback at each phase; previous client; fresh client; paired backup/restore; repeated operation idempotency.

No production unlock or default flag change was made by this audit.
