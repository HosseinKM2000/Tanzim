# GATE 1 — Safe Catalog adoption and provisioning decoupling

**Gate status:** GO — DEVELOPMENT ONLY

**Authorization:** DEVELOPMENT ONLY

**Captured:** 2026-11-18, Asia/Tehran

**Branch:** `feat/catalog-on-demand-adoption`

**Starting commit:** `f5aeb9488c2aa53d2c87132b4848128cff8b3967`

**Initial worktree:** clean

**Initial Alembic head:** `20261116_0019`

## Scope and invariants

Gate 1 changes only how a shared Catalog definition becomes a Store-owned
Inventory record. Catalog browsing is reference-data access; adoption is an
explicit inventory-write intent. Existing inventory identity, quantities,
prices, labels, categories, barcodes, invoices, media, audit history and pending
operations remain intact. Store context continues to come only from the
authenticated active membership.

No migration, production deployment, image-storage change, Catalog import
change, pagination work or later gate is authorized here.

## G1-A — Current contract discovery

### Current concepts

- Shared Catalog definitions are `CatalogProduct(is_shared=True)` in
  `backend/app/models.py:CatalogProduct`.
- Store operations are `InventoryItem` rows, uniquely constrained by
  `(store_id, catalog_product_id)` through
  `uq_inventory_items_store_catalog`.
- Custom products also require a private `CatalogProduct(is_shared=False)`
  because `inventory_items.catalog_product_id` is non-nullable.
- Local operational projections are partitioned by actor and Store in
  `src/shared/lib/infrastructure/storage/inventory-storage.ts`.
- Product creation is local-first in
  `src/features/app/inventory/services/inventory-service.ts`: IndexedDB and the
  outbox commit together, then `/sync/batch` accepts and authorizes the command.

### Dependency map

| Call site / path | Current trigger | Records and side effects | Gate 1 behavior | Risk and required evidence |
|---|---|---|---|---|
| `routers/auth.py:update_industry` → `provision_industry_inventory` | Store owner selects or changes a legacy industry | Locks Store; reads every active shared Catalog row in the industry; creates one `InventoryItem` per allowed Catalog row; hides incompatible legacy Catalog-backed items; mirrors industry to Store/owner/user; emits `SyncChange` per changed item | Flag off remains identical. Flag on changes industry and preserves/hides existing rows but creates no Inventory rows for the new industry's Catalog | Industry switching must not delete history; test 10k Catalog rows, legacy items and SyncChange counts |
| `catalog_product_service.create_catalog_product` → `_reconcile_catalog_assignments` | Platform Catalog manager publishes a shared product | Locks Catalog row and every Store in the industry; capacity queries per Store; creates one Inventory row per eligible Store; emits one SyncChange per row | Flag off remains identical. Flag on publishes only the shared definition and performs zero Store fan-out | Test row/query growth at 1k/5k/10k definitions and multiple Stores |
| `catalog_product_service.update_catalog_product` → `_reconcile_catalog_assignments` | Manager changes name, description, brand, packaging or industry | Updates definition; marks existing assignments Catalog-backed; hides assignments now incompatible with Store industry; creates missing assignments in the target industry; emits SyncChanges | Flag on updates only existing linked Inventory projections; never creates a missing assignment | Test metadata propagation, industry change, preservation and zero new Inventory rows |
| `catalog_product_service.restore_catalog_product` → `_reconcile_catalog_assignments` | Manager restores an archived definition | Reactivates definition, then provisions every missing Store assignment and emits SyncChanges | Flag on restores definition and refreshes existing assignments only | Test restore with legacy assignment and Store without assignment |
| `catalog_product_service.archive_catalog_product` | Manager archives definition | Keeps linked Inventory rows; emits updated snapshots so clients learn `is_active=False` | Unchanged; no new rows | Test identity/history preservation and client ineligibility |
| `catalog_product_service.permanently_delete_catalog_product` | Explicit platform-admin permanent delete | Deletes all linked Inventory rows transactionally, emits tombstones and removes uploaded files after commit | Out of the adoption change; behavior preserved | Existing lifecycle tests must remain green; production use remains outside this gate |
| `routers/products.py:create_product` | Direct online custom-product form | Creates a private Catalog row plus one Store Inventory row, optional upload/barcode | Unchanged; it is not shared-Catalog adoption | Existing product workflows and media tests |
| `routers/sync.py:_apply_product_operation` + `_catalog_for_operation` | Local-first/outbox CREATE | Accepts client Inventory ID; shared Catalog ID links to an active same-industry definition; otherwise creates a private definition; creates Inventory, barcodes/movement evidence and SyncChange | Reused for explicit adoption. Flag-on duplicate shared adoption resolves to the existing Store row under the Store lock instead of creating/replacing identity | Test repeated operation, different operation IDs, two devices, rollback and client reconciliation |
| `ProductForm` / `AddProductForm` | User explicitly submits inventory creation | Creates a local Inventory projection and standard product CREATE outbox operation | Catalog browser opens this existing authorized workflow with an immutable shared Catalog snapshot; submit is the adoption intent | Component/E2E tests for explicitness, permissions, offline submit and reconnect |
| `/tools/catalog` / `CatalogPreferences` | Customer opens Catalog tool | Today it only toggles visibility of already-provisioned local rows; it does not browse shared definitions | Flag off keeps this view. Flag on shows same-industry shared definitions and offers an explicit “add to inventory” route | Browse must write zero Inventory/outbox/media records; E2E both projects |
| `catalogs.api.ts` and `/catalog-products` GET | Authorized Catalog read/search | Online-only reference read; no Inventory writes | Reused for flag-on browsing; industry is derived from the authenticated user in UI and adoption is revalidated server-side | Direct API security and zero-write test |
| `inventory-storage.ts`, `queue.service.ts`, `product-sync.ts` | Local product mutation and reconnect | Actor/Store-scoped projection, durable outbox, replay, conflict preservation | Schema stays unchanged. Adoption uses the existing product CREATE payload with positive shared `catalog_product.id` | Offline/reconnect/retry/no-local-duplicate tests |
| Category/label creation | Explicit Store workflows or taxonomy adoption | Store-owned category/label records and their own Sync operations | Browsing creates none. The existing inventory form remains responsible for any required category and labels during explicit adoption | Assert browse has zero Store category/label writes |
| Store signup/onboarding | Signup creates Store/membership; legacy industry selection later invokes provisioning | Store itself does not directly fan out Catalog rows | Flag-on industry selection completes without Catalog fan-out | New Store + 10k Catalog integration benchmark |

### Existing explicit actions

The repository currently has no customer action that explicitly adopts a shared
Catalog item. Industry selection and Catalog publication implicitly materialize
rows. The product form explicitly creates only custom/private products. Gate 1
therefore defines one new explicit action: from the same-industry Catalog browse
view, the user chooses “add to inventory”, reviews the prefilled existing
product form, supplies Store-owned operational fields, and submits. Merely
opening a card or details view is never adoption.

### Offline contract discovered

Custom product submission is already local-first and works offline through the
standard product CREATE outbox. Shared Catalog listing itself is online-only and
is not stored in a durable local Catalog table. Gate 1 will not add such a table.
An adoption form whose Catalog snapshot was loaded while online may be submitted
after connectivity loss using the standard outbox. Starting a brand-new Catalog
browse/adoption session from a cold offline profile is unsupported and must show
an explicit connectivity message. This does not regress an existing offline
adoption flow because none exists today.

## Lifecycle scenario matrix

| # | Scenario | Preconditions and event | Expected database/local/Sync state | Error and idempotency | Regression evidence |
|---:|---|---|---|---|---|
| 1 | New Store selects industry with 10k Catalog rows | Flag on; empty Store; owner selects industry | Store industry changes; zero Inventory/category/label rows and zero product SyncChanges; local inventory remains empty after sync | Invalid/inactive industry rejects atomically | PostgreSQL scale test and query/row counts |
| 2 | New Catalog product for existing Stores | Flag on; Stores already use industry; manager publishes | One shared Catalog row; zero new Inventory rows and product SyncChanges | Duplicate name retains current conflict behavior | Backend + PostgreSQL fan-out test |
| 3 | Catalog rename | Existing linked legacy/adopted items | Shared name changes; linked rows keep IDs/operational fields; snapshots update | Transaction rollback on failure | Lifecycle test |
| 4 | Description/brand update | Existing and missing Store assignments | Definition and existing linked snapshots update; no missing assignment is created | Retried manager request remains current API behavior | Lifecycle test |
| 5 | Archive | Active definition linked to historical Inventory | Definition inactive; Inventory/history retained; clients receive updated ineligible snapshot | Repeated archive returns same state | Existing + new lifecycle tests |
| 6 | Restore | Archived definition with/without assignments | Definition active; existing assignments refresh; absent assignments remain absent | Repeated restore idempotent | Lifecycle test |
| 7 | Store industry change | Store has Catalog-backed and custom products | Incompatible Catalog-backed rows are hidden, not deleted; custom and historical rows untouched; no new industry fan-out | Unsupported taxonomy path retains existing explicit error | Store-personnel/backend test |
| 8 | Explicit adoption | Flag on; active same-industry Catalog; authorized user opens prefilled form and submits | Exactly one Store Inventory row linked to shared ID; local row/outbox use standard product path; Store fields are user-owned | Inactive/wrong-industry definition rejects | Component, sync and E2E tests |
| 9 | Add same item twice | Store already linked | Existing Inventory identity is returned/opened; no duplicate row/outbox after reconciliation | Repeated click is idempotent | Unit + API/E2E test |
| 10 | Two devices adopt concurrently | Same Store/Catalog; different operation IDs | Store lock + unique constraint produce one Inventory row; both callers resolve to its stable ID | Loser does not overwrite first operational fields | PostgreSQL concurrent test |
| 11 | Adopt while offline | Catalog/form snapshot already loaded; network then drops | Local Inventory and CREATE outbox commit atomically; reconnect creates/resolves one server row | Cold offline browse is explicitly unavailable; rejected payload remains recoverable | Frontend local-first test + E2E network transition |
| 12 | Edit Catalog-backed Inventory | Existing adopted/legacy row | Quantity, prices, Store label/category/note/media remain editable per current permissions; shared metadata remains admin-controlled | Version conflict behavior unchanged | Existing inventory/sync tests |
| 13 | Delete/archive Store Inventory | Catalog-backed row | Current delete prohibition and hide workflow remain; no shared definition deletion | Repeated hide/restore safe | Existing tests |
| 14 | Historical invoice link | Invoice line references Inventory row | Adoption changes never replace/delete that Inventory ID | Permanent Catalog delete remains existing explicit admin operation outside rollout | Invoice/lifecycle regression |
| 15 | Previously provisioned unused row | Zero stock, no detected activity | Row remains unchanged and usable; no cleanup/detach inference | N/A | Legacy compatibility test |
| 16 | Pending outbox during Catalog update | Local edit/create pending while manager updates metadata | Pending operational payload is preserved; pull does not overwrite pending local row; later replay uses current shared definition validation | Conflict remains recoverable | Product-sync test |
| 17 | Catalog archived during offline adoption | Local CREATE pending, shared definition becomes inactive | Acceptance rejects `CATALOG_PRODUCT_NOT_AVAILABLE`; local payload is retained as non-retrying recovery/conflict data | Reconnect repetition does not create row | Existing permanent-error path + focused test |
| 18 | Unauthorized adoption | Missing Catalog tool/capability, create permission or inventory capability | No Inventory/SyncChange/media write | Direct API/sync request denied at acceptance | Security tests |

## Chosen implementation contract

1. Add backend flag `CATALOG_ON_DEMAND_ADOPTION_ENABLED`, default false.
2. Flag off executes the current provisioning/reconciliation paths unchanged.
3. Flag on prevents missing Inventory creation in both fan-out functions while
   still refreshing or hiding existing linked rows.
4. Flag-on customer UI browses only active definitions for the authenticated
   Store industry and routes adoption through the existing product form.
5. The standard local-first product CREATE operation remains the only offline
   mutation pipeline. A positive shared Catalog ID is the adoption intent.
6. Acceptance rechecks Store, industry, active state, entitlement and
   permissions. The Store lock and existing unique constraint provide the
   server concurrency boundary.
7. Duplicate adoption resolves to the existing valid Store Inventory record;
   no stable server ID is replaced.

## Migration decision

No migration is planned. The existing non-null shared relationship and
`uq_inventory_items_store_catalog` already express the required association and
uniqueness. Avoiding schema change keeps rollback flag-only and preserves old
clients and all legacy associations.

## Phase decisions

| Phase | Status | Evidence |
|---|---|---|
| G1-A read-only discovery | GO | Call sites, models, Alembic head, local schema, outbox and UI inspected; dependency/scenario maps recorded above |
| G1-B tests and flag | GO | Default-off flag plus paired legacy/on-demand provisioning and reconciliation tests |
| G1-C minimal implementation | GO | Fan-out callers gated; explicit UI reuses ProductForm, IndexedDB and the product outbox |
| G1-D integration and recovery | GO | PostgreSQL concurrency, stable identity, inactive reference, sync projection and scale tests pass |
| G1-E full validation | GO | 418 frontend, 109 backend, 24 PostgreSQL and 132 hosted E2E tests pass; 8 established external-prerequisite skips |

## Implemented paths

- `backend/app/config.py` adds default-off
  `CATALOG_ON_DEMAND_ADOPTION_ENABLED` through the existing environment flag
  convention.
- `provision_industry_inventory` preserves the Store industry transition and
  legacy-row hiding but, with the flag on, never enumerates Catalog definitions
  or creates missing Inventory rows.
- `_reconcile_catalog_assignments` refreshes only linked rows and returns before
  enumerating industry Stores when the flag is on.
- `routers/sync.py:_apply_product_operation` validates an active shared
  same-industry reference, serializes acceptance on the authenticated Store
  row, and resolves an existing `(store_id, catalog_product_id)` assignment to
  its stable ID. A different pending payload receives the non-retrying
  `CATALOG_ALREADY_ADOPTED` conflict and remains recovery evidence.
- Authenticated `GET /catalog-products/adoption-status` exposes only the flag
  state and creates no business records.
- `CatalogAdoption`, `/tools/catalog`, and `/inventory/add?catalogId=...` make
  browsing read-only. Only submitting the existing inventory form expresses
  adoption intent. Flag off renders the unchanged Catalog preferences surface.
- `InventoryService.create` returns an existing local adoption before capacity,
  media, barcode or outbox work. `product-sync.ts` removes a duplicate device's
  provisional projection when the server returns the stable existing ID while
  retaining the rejected outbox payload.

No Catalog/category/label/media/invoice write is attached to browsing. E2E
inspects IndexedDB before adoption and proves it remains empty.

## Authorization, isolation and compatibility

The browser never supplies Store identity. Acceptance uses the active
membership-derived Store, existing `products.create` permission,
`inventory.write`/`sync` entitlements, capacity policy, active-state and
industry validation. The Store row lock serializes two devices; the existing
unique constraint remains the final guard. An inactive reference returns
`CATALOG_PRODUCT_NOT_AVAILABLE` without an Inventory row.

Existing linked rows are neither deleted nor detached. Their ID, quantity,
prices, label/category relations, note, hidden state, media, barcodes and invoice
references survive. Dexie schema, backup format and outbox format did not
change. Cold offline Catalog browsing remains unsupported; once a definition
and form are loaded, submission uses the existing local-first product command.
Generic offline create/reconnect coverage remains in the PWA suite, while
adoption-specific projection and duplicate convergence are unit/sync tested.

## Scale evidence (disposable PostgreSQL)

Command: `pytest ... test_postgresql.py -k on_demand_provisioning_scale -s -q`

| Active Catalog rows | SQL statements | Inventory rows written | Elapsed |
|---:|---:|---:|---:|
| 1,000 | 11 | 0 | 37.73 ms |
| 5,000 | 9 | 0 | 24.11 ms |
| 10,000 | 9 | 0 | 26.50 ms |

The first selection includes two one-time compatibility writes. Increasing the
Catalog from 5k to 10k adds no statements and no Inventory writes. Publication,
update and restore return before Store enumeration under the flag. The
PostgreSQL suite verifies that reconciliation creates no missing assignment;
Catalog browsing separately produces zero local Inventory writes. 50k was not
rerun because the required 1k/5k/10k evidence already showed constant database
work and the gate forbids pagination work.

## Verification evidence

- `npm.cmd run test:regression`: PASS — 418 frontend tests, 109 backend tests,
  test typecheck, production build and lint.
- `npm.cmd run test:backend:postgres:local`: PASS — 24 PostgreSQL tests.
- Production-preview Playwright at `http://127.0.0.1:4173`, configured 2
  workers: PASS — 132 passed, 8 established external-prerequisite skips,
  0 failed.
- Focused adoption E2E: PASS — 4/4 across desktop/mobile and flag on/off.
- Final focused inactive/duplicate sync tests: PASS — 2/2.

An earlier direct run against Vite dev produced expected PWA cache failures
because dev mode does not install the production service worker. It is not the
release-like result; the complete rerun against the built preview passed both
PWA cold-cache projects.

## Remaining risks

- A cold offline profile cannot browse shared Catalog reference data; a durable
  Catalog cache is outside Gate 1.
- A losing concurrent/offline adoption keeps its rejected operational payload
  for recovery rather than silently overwriting the winner. The visible
  projection converges to the stable row, but the conflict may need review.
- The Catalog list remains unpaginated by explicit restriction; this gate
  removes write fan-out, not reference-list transfer cost.

## Rollback contract

Because no schema or asynchronous backfill is introduced, disabling the flag
restores legacy fan-out for future industry selection and Catalog lifecycle
events. Inventory rows adopted while enabled are valid legacy-compatible linked
rows and are intentionally retained. Rollback never deletes or detaches them;
therefore “rollback” means behavior rollback, not data reversal.

## Final evidence

All mandatory development evidence is green. No migration was created. The
disposable PostgreSQL database was rebuilt only to the existing Alembic head
`20261116_0019`. Decision: **GO — DEVELOPMENT ONLY**. Production remains
**NO-GO / NOT ASSESSED**. No merge, push, deployment or Gate 2 work occurred.
