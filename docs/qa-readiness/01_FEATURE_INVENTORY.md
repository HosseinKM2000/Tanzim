# Gate 7-PREP — Feature inventory

Baseline: `88b9a19ab2b67ee05af4aa342d3dc543cf108593`
Scope: isolated QA development only. Statuses describe repository behavior, not production approval.

| Capability | UI | Backend/local service | Access boundary | QA data / scenario | Status | Coverage / gap |
|---|---|---|---|---|---|---|
| Signup, login, logout, session | `/auth/register`, `/auth/login` | `/api/auth/*` | public then authenticated session/device | Smoke owner | PASS | unit, backend and E2E authentication |
| Initial workspace | `/industry` | owner store creation + taxonomy API | owner; online | New empty Smoke store | PASS with QA flag | Existing used store is intentionally blocked |
| Store and membership | personnel/settings | `/api/store/*` | active server-derived membership | Team profile | PASS | one owner workspace per customer in V1; arbitrary store switching is NOT IMPLEMENTED |
| Dashboard | `/dashboard`, reports and financial | local projections + dashboard API | `dashboard.view`, plan field visibility | zero/low/normal stock, invoices | PASS | seeded values exercise cards and reports |
| Inventory CRUD | `/inventory/*` | products, inventory and sync APIs | product permissions and capacity | 8/72 products; hidden/out-of-stock/low-stock | PASS | large 1k/5k/10k is opt-in Stress only |
| Categories | `/tools/categories` | categories API/local sync | `categories.manage`, industry policy | three scoped categories/store | PASS | approved automotive parent verification remains existing test coverage |
| Labels | `/tools/labels` | local label service + sync | `labels.manage` | three labels and multi-label items | PASS | scoped to actor/store locally |
| Product details and prices | inventory list/edit | products API/local repository | view/edit and price permissions | sale/purchase prices, missing image | PASS | purchase-price redaction covered by role tests |
| Private images | product image dialog | media API, OPFS, media transfer | product edit + store ownership | Gate 6 live media fixture | PASS automated | physical storage pressure remains device validation |
| Barcode generation/lifecycle | product form/manager | taxonomy/sync barcode services | barcode capability + permission | external barcodes in seed; internal lifecycle fixtures | PASS software | physical read/print BLOCKED |
| Scanner | `/tools/scanner` | local HID/camera pipeline + resolution API | lookup/change permissions | success/not-found/duplicate fixtures | PASS software | target cameras/scanners BLOCKED |
| Label print preview | barcode dialog | local renderer/browser print | `labels.print` | Code128/DataMatrix boundary tests | PASS software | printer scaling/stock/font BLOCKED |
| Purchase and sales invoices | `/tools/invoices` | invoice sync/API + IndexedDB journal | invoice capabilities/permissions | purchase and sale, multiple lines | PASS | cancellation supported; payment states are NOT IMPLEMENTED |
| Proforma invoices | — | — | — | — | NOT IMPLEMENTED | no model/route found |
| Counterparties | `/tools/counterparties` | counterparties API | view/manage permissions | supplier and customer per store | PASS | synthetic phones/addresses only |
| Financial reports | `/dashboard/financial`, `/dashboard/reports` | invoice/dashboard services | plan visibility + dashboard | margin variation and date ranges | PASS | depends on posted invoice journal |
| Shared catalog/adoption | `/tools/catalog` | catalog product APIs | catalog entitlement, tool policy | Gate 1–6 fixtures | PASS behind flags | four catalog flags default OFF |
| Catalog families/images/offline | catalog browser/image settings | reference publication + OPFS/IndexedDB | catalog flags, authenticated store scope | Gate 6 two releases, preview/detail | PASS automated | field licensing and physical device remain BLOCKED |
| Search/sort/filter | inventory/catalog lists | local and cursor-backed readers | same as resource | long/short names, large-list option | PASS | Stress profile optional |
| Bulk operations | inventory selection/actions | local mutation + sync | `products.bulk` and field permissions | Comprehensive profile | PASS | no permission bypass |
| Import/export | `/tools/import`, `/tools/export` | local Excel + export APIs | tool permissions | Comprehensive products | PASS | invalid rows isolated by validation |
| Backup/restore/recovery | `/setting/backup`, `/tools/recovery` | local backup v2/recovery sessions | owner + backup/restore capability | Gate 6 recovery and generated QA profile | PASS automated | operator-run restore rehearsal documented |
| Sync/outbox | `/setting/sync` | durable queue, batch/changes APIs | acceptance-time authorization | retry/conflict/fault fixtures | PASS | terminal rejection is non-retrying recovery data |
| Conflict resolution | recovery tooling | recovery item/session services | owner-only application as new operation | controlled test fixtures | PASS limited | no arbitrary server-wins replay |
| Activity history | `/tools/activity` | `/api/store/activity` | owner-only V1 | accepted/rejected operations | PASS | stable server actor/membership attribution |
| Personnel and roles | `/setting/personnel`, `/setting/roles` | personnel APIs | online, owner, plan capacity | Team owner/operator | PASS | never queued offline |
| Entitlements/plans | subscription/settings/admin | plans and admin APIs | server store context | Free/Pro/VIP stores | PASS | checkout/real payment NOT IMPLEMENTED |
| Notifications | header panel | local notification derivation | authenticated context | capacity/profile/sync states | PASS local | external delivery NOT IMPLEMENTED |
| Settings/tools/help/theme | `/setting/*`, `/tools/*` | local preferences and scoped APIs | route/tool policies | light/dark/system, Persian content | PASS | — |
| PWA install/update | update settings | service worker/update coordinator | build/runtime | two-build update | PASS automated | platform install prompts vary by device |
| Offline operation | operational routes | IndexedDB/OPFS/outbox | cached lease/entitlement | offline create/edit/restart | PASS automated | personnel lease requires later online verification |
| Responsive UI | all operational routes | browser | same feature access | desktop/mobile Playwright projects | PASS automated | physical-device matrix remains BLOCKED |
| Cart | — | — | — | — | NOT IMPLEMENTED | invoice composition exists; no separate cart domain found |

## QA-only gates

- `TAXONOMY_ADOPTION_ENABLED=true` may be used only by the isolated QA backend. It enables adoption for a new/unused owner store; it does not bypass owner checks, policy-version checks, category validation, or `LEGACY_STORE_REVIEW_REQUIRED`.
- Catalog flags may be enabled only in the isolated backend/client pair described in the runbook. Their source defaults remain false.
- No feature is unlocked merely by hiding a warning or removing a disabled property.
