# V1 capability matrix

Audit boundary: `test-v1-commercial-readiness-audit`, based on `9a2c458`. Code is the source of truth; earlier Gate documents are supporting evidence only. A row is an independently releasable action or state contract, not merely a menu item.

| ID | Module | Route/action | Status | Dependencies | Permissions/plan | Online/offline | Existing tests | Missing tests | Release risk |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Account | `/auth/register` owner signup | WORKING | FastAPI, PostgreSQL | public; Free/Solo created | online | unit, backend, E2E | physical low-end phone | medium |
| AUTH-02 | Account | `/auth/login` username/password | WORKING | session + fingerprint | active account | online; cached session afterward | backend, E2E | brute-force/rate-limit | high |
| AUTH-03 | Account | logout current device | WORKING | session store | authenticated | online | backend, E2E | lost-response UX | medium |
| AUTH-04 | Account | session expiry/revocation | WORKING | session verification | authenticated | server acceptance online | backend, sync tests | multi-device field run | high |
| AUTH-05 | Account | edit profile/mobile | WORKING | canonical phone | owner/personnel self | online | backend, component | concurrent profile edits | medium |
| AUTH-06 | Account | change password | WORKING | current password; session revocation | authenticated | online-only | backend | browser journey | high |
| AUTH-07 | Account | forgotten-password recovery | PARTIAL | enumeration-safe request boundary; verified delivery provider absent | public request only | online | backend security + E2E | provider delivery, credential expiry/replay/reset | high |
| AUTH-08 | Account | OTP/mobile verification/resend | NOT_IMPLEMENTED | no SMS/OTP service | none | unavailable | none | all cases | high |
| AUTH-09 | Account | account deletion/export-before-delete | NOT_IMPLEMENTED | product/legal decision | owner | unavailable | none | all cases | high |
| AUTH-10 | Account | terms/privacy acceptance | PARTIAL | accessible status routes and signup links; approved copy absent | public | online | hosted E2E keyboard journey | approved documents/versioned consent decision | high |
| ONB-01 | Onboarding | first owner Store creation | WORKING | signup transaction | new owner | online | backend/PostgreSQL | interrupted browser journey | high |
| ONB-02 | Onboarding | choose taxonomy for unused Store | WORKING | `TAXONOMY_ADOPTION_ENABLED` | owner; flag | online | backend/PostgreSQL/component | physical label gate | high |
| ONB-03 | Onboarding | change taxonomy for used Store | BLOCKED | migration contract absent | owner | online | guard tests | approved migration/rollback | high |
| ONB-04 | Onboarding | switch account/store | PARTIAL | actor/store partition cleanup | memberships | online verification | unit/component | explicit multi-store selector | medium |
| INV-01 | Inventory | create custom product | WORKING | Dexie/outbox/API | `inventory.write` + capacity | Solo offline; Team online | unit/component/E2E/backend | physical device | high |
| INV-02 | Inventory | adopt catalog product | WORKING | catalog flag/API | inventory write/capacity | flag-dependent; offline cached family | Gate 1–4 tests | field/license | high |
| INV-03 | Inventory | list/search/filter/sort/view modes | WORKING | Dexie, virtualizer | products view | offline | unit/component/E2E | 10k low-end handset | medium |
| INV-04 | Inventory | edit product/price/threshold/labels | WORKING | local transaction/outbox | inventory write | Solo offline; Team online | unit/component/backend | concurrent devices | high |
| INV-05 | Inventory | quick stock adjustment | WORKING | movement/sync | inventory write | Solo offline; Team online | unit/component/backend | scanner concurrence | high |
| INV-06 | Inventory | hide catalog-backed product | WORKING | catalog relationship | inventory write | local-first | unit/backend | cross-version client | medium |
| INV-07 | Inventory | delete/restore custom product | WORKING | tombstone/change feed | inventory write | local-first | unit/backend | multi-device destructive UX | high |
| INV-08 | Inventory | bulk edit/delete | WORKING | per-product queue | `bulk.edit`/write | Solo offline; Team policy | unit/component | large selection interruption | high |
| INV-09 | Inventory | XLSX import/template | WORKING | `@office-kit/xlsx` | `import.xlsx` | browser-local then sync | unit/E2E | malformed/huge workbook field run | medium |
| INV-10 | Inventory | product images | WORKING | OPFS + protected media API | inventory write/media | local-first, later upload | unit/component/real E2E | storage pressure/device loss | high |
| INV-11 | Inventory | product variants | NOT_IMPLEMENTED | no variant model/service | none | unavailable | none | product decision | low |
| TAX-01 | Categories | category CRUD | WORKING | category storage/API | inventory write | local-first | unit/backend | taxonomy conflict journey | medium |
| TAX-02 | Labels | label CRUD/filter | WORKING | label storage/API | inventory write | local-first | unit/component/backend | long/duplicate Persian names | medium |
| BAR-01 | Barcodes | manual manufacturer barcode | WORKING | reservation/lifecycle | barcode manage | Solo offline command; Team online | unit/backend/PostgreSQL | physical scanner | high |
| BAR-02 | Barcodes | generated internal DataMatrix identity | WORKING | category reference | barcode manage; taxonomy | guarded | unit/backend/PostgreSQL | physical print/readability | high |
| BAR-03 | Barcodes | Code128 label encode/render/decode | WORKING | bwip/zxing | label print | browser-local | unit | real printers/scanners | high |
| BAR-04 | Barcodes | camera scan | NOT_VERIFIED | secure context/camera/ZXing | barcode lookup | browser online/offline data | unit, mocked E2E | physical camera permission/quality | high |
| BAR-05 | Barcodes | HID scanner | NOT_VERIFIED | keyboard wedge | barcode lookup | local | unit | physical scanner layouts | high |
| BAR-06 | Barcodes | retire/delete/regenerate | WORKING | immutable reservation history | barcode manage | server acceptance | unit/backend | old-label field scan | high |
| SALE-01 | Sales | purchase invoice post | WORKING | invoice domain + movements | paid invoice capability | Solo offline; Team online | unit/backend/PostgreSQL/E2E | real continuous browser+PG | high |
| SALE-02 | Sales | sales invoice post | WORKING | stock availability | paid invoice capability | Solo offline; Team online | unit/backend/PostgreSQL/E2E | concurrent last-stock device | high |
| SALE-03 | Sales | cancel posted invoice | WORKING | compensating movements | invoice permission | online acceptance/team policy | unit/backend/PostgreSQL | operator browser journey | high |
| SALE-04 | Sales | invoice history/filter | WORKING | local/server hydration | invoice read + price redaction | cached/offline | unit/E2E | very long history handset | medium |
| SALE-05 | Sales | PDF/print/native share | PARTIAL | Chromium raster PDF | invoice read/prices | local snapshot | unit/E2E | tagged PDF, Safari, physical print/share | medium |
| SALE-06 | Sales | proforma | NOT_IMPLEMENTED | no domain state | none | unavailable | none | product decision | low |
| SALE-07 | Sales | partial return/payment/tax | NOT_IMPLEMENTED | no domain model | none | unavailable | none | commercial decision | medium |
| PARTY-01 | Business | counterparties CRUD/search | WORKING | store-scoped API | invoice/customer access | online | backend/E2E | offline editing | medium |
| DASH-01 | Business | inventory dashboard | WORKING | local projection | products view | offline | unit/component/E2E | low-end performance | medium |
| DASH-02 | Business | financial/invoice reports | WORKING | immutable invoice snapshots | purchase-price redaction | cached/offline | unit/E2E | accountant validation | high |
| ACT-01 | Business | activity history | WORKING | server-derived actor/membership | activity read | online/cached presentation | unit/backend | long history pagination | medium |
| NOTE-01 | Business | notifications/status | WORKING | sync/backup/update sources | authenticated | local | unit/component | screen-reader live regions | medium |
| EXP-01 | Business | CSV/XLS/PDF export | PARTIAL | browser download/print | export capability | local/server | unit/E2E | true XLSX/PDF semantics | medium |
| BAK-01 | Backup | local/external backup snapshot | WORKING | browser file/OPFS | backup use | offline capable | unit/component/E2E | physical permission/device | high |
| BAK-02 | Backup | browser-local restore review/apply | WORKING | Web Locks/checkpoint | owner/store-bound | offline | unit/E2E | post-commit OS kill | high |
| BAK-03 | Backup | server restore endpoint | NOT_IMPLEMENTED | endpoint returns 501 | owner | unavailable | backend expectation | complete safe server contract | high |
| SYNC-01 | Sync | durable outbox push/pull | WORKING | Dexie + batch API | acceptance-time auth | reconnect | extensive unit/backend/real E2E | poor-network field run | high |
| SYNC-02 | Sync | rejected/conflict recovery | WORKING | immutable recovery evidence | same actor/store | offline review; online resolution | unit/E2E | support operator drill | high |
| SYNC-03 | Sync | account/store partitioning | WORKING | active membership context | deny unknown | local partitions | unit/backend/PostgreSQL | real multi-account device | critical |
| SYNC-04 | Sync | concurrent/lost-response idempotency | WORKING | operation identity/fingerprint | server authorized | online retry | unit/backend/PostgreSQL | WAN chaos run | critical |
| TEAM-01 | Teams | personnel create/reset/deactivate | WORKING | owner API | owner-only; online-only | online | backend/component/E2E | physical multi-device | high |
| TEAM-02 | Teams | role CRUD/permissions | WORKING | centralized permissions | owner-only; online-only | online | backend/component/E2E | unknown permission deny journey | high |
| TEAM-03 | Teams | invitation flow | NOT_IMPLEMENTED | credentials are owner-created | owner | unavailable | none | product/security decision | medium |
| TEAM-04 | Teams | offline entitlement lease | WORKING | cached snapshot/expiry | active personnel | bounded offline | unit/backend | clock/device field run | high |
| SUB-01 | Subscription | plan/capability/limit enforcement | WORKING | registry + entitlement | Free/Personal/Pro/VIP | server-authoritative | unit/backend/PostgreSQL/E2E | approved final allocation | high |
| SUB-02 | Subscription | offer display | PARTIAL | admin-configured offer | authenticated | online | backend/unit | approved prices/terms | high |
| SUB-03 | Subscription | checkout/payment/callback/refund | NOT_IMPLEMENTED | provider absent | none | unavailable | none | all cases | high |
| SUB-04 | Subscription | expiry/renewal/grace | PARTIAL | entitlement states | plan policy | server verified | backend/unit | approved commercial policy + E2E | high |
| CAT-01 | Catalog | on-demand adoption/provisioning | WORKING | flag, cursor API | store/category/capacity | online | Gate 1 tests | production flag decision | high |
| CAT-02 | Catalog | paginated browse/search | WORKING | cursor reader flag | products view | online | Gate 2 tests | production scale | medium |
| CAT-03 | Catalog | families/reference images | WORKING | reference media flag | approved media only | online/cache | Gate 3 tests | real license evidence | high |
| CAT-04 | Catalog | offline family download/LRU | WORKING | OPFS/IndexedDB flag | active account/store | offline after download | Gate 4 tests | physical storage pressure | high |
| CAT-05 | Catalog | publish/release/rollback | WORKING | admin API + manifest/hash | platform admin workspace | online admin | Gate 3–6 tests | production operations/rights | high |
| CAT-06 | Catalog | incremental update/old client | WORKING | release pointer/manifest | flags | cached/offline | Gate 4–6 E2E | physical device | high |
| PWA-01 | Platform | install/offline shell | WORKING | manifest/service worker | browser support | offline | E2E | physical iOS/Android | high |
| PWA-02 | Platform | detect/announce/apply update | WORKING | release metadata/SW locks | authenticated | online check, safe activation | unit/component/real E2E | production publication rehearsal | high |
| PWA-03 | Platform | unsynced/unsaved-work protection | WORKING | Web Locks/outbox/journals | active partition | offline-aware | unit/real E2E | OS process kill | critical |
| UI-01 | Platform | responsive RTL shell | WORKING | CSS/Radix | all | offline | component/E2E | physical devices/WebKit | medium |
| UI-02 | Platform | light/dark/system + density | WORKING | theme storage | all | offline | unit/E2E | forced-colors/contrast | low |
| UI-03 | Platform | keyboard/screen-reader accessibility | PARTIAL | semantic UI/Radix | all | offline | component fragments | full WCAG audit; focus/live regions | medium |
| HELP-01 | Platform | contextual help/FAQ/support export | WORKING | local safe diagnostics | authenticated | offline export | unit/component/E2E | support process ownership | medium |
| OPS-01 | Platform | health/build/schema diagnostics | WORKING | backend middleware | operator | online | backend | target monitoring integration | high |
| OPS-02 | Platform | production backup/monitoring/rollback | BLOCKED | target access/operators absent | operations | external | Gate 6 local evidence | target rehearsal and ownership | critical |

## Source map

- Routes and guards: `src/routes/`, `src/shared/access/`, `backend/app/routers/`, `backend/app/deps.py`.
- Offline/storage: `src/shared/lib/infrastructure/`, `src/features/catalog-offline/`, `public/sw.js`.
- Authoritative services: `backend/app/services/`, especially invoice, inventory, taxonomy, subscription and store authorization.
- Automated evidence: `tests/unit/`, `tests/component/`, `tests/e2e/`, `backend/tests/` and `docs/catalog-rollout/`.
- UI review deltas: `transition-all` remains in `src/features/app/layout/nav-menu.tsx:24-32`; `outline-none` in `src/features/app/layout/quick-access-page.tsx:48` requires its CSS focus replacement to remain effective. These are P2 audit items, not evidence of a broken core flow.
