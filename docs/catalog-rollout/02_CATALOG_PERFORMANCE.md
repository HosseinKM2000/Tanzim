# GATE 2 — Scalable Catalog browsing, pagination and image loading

**Gate status:** GO — DEVELOPMENT ONLY

**Authorization:** DEVELOPMENT ONLY

**Captured:** 2026-11-18, Asia/Tehran

**Branch:** `feat/catalog-scalable-browsing`

**Starting commit:** `422922b`

**Initial worktree:** clean

**Initial Alembic head:** `20261116_0019`

## Scope and preserved contracts

Gate 2 optimizes read-only shared-Catalog browsing. It does not rewrite Gate 1
adoption/provisioning, Sync, outbox, backup, barcode, invoice, private media or
OPFS behavior. Cold offline Catalog browsing remains unsupported. Existing
adopted Inventory remains local-first and Store-owned.

## G2-A — Current API and consumer map

| Path / consumer | Current contract | Image behavior | Gate 2 decision |
|---|---|---|---|
| `GET /catalog-products` | Authenticated `CurrentCatalogUser`; optional `search` and `industry_id`; active shared rows; returns the entire matching list ordered by `created_at DESC, id DESC` | Returns raw `image_url` | Preserve unchanged for rollback and old clients |
| `GET /catalog-products/archived` | Catalog manager only; same filters; entire inactive list | Returns raw `image_url` | Preserve for the archived CRUD view in this gate |
| `GET /catalog-products/{id}` | Authenticated active shared definition | Details/form resolve `image_url` directly | Preserve; explicit adoption still revalidates the definition |
| `GET /catalog-products/adoption-status` | Authenticated feature-state read | None | Extend additively with the default-off cursor-read flag |
| `CatalogAdoption` at `/tools/catalog` | Gate 1 customer browser; queries active rows for the authenticated user's industry, maps all cards, separately reads local Inventory to mark adopted IDs | Does not currently render Catalog images | New cursor/infinite/virtual/lazy path when both Gate 1 adoption and Gate 2 read flags are enabled; legacy list remains the rollback path |
| `Catalogs` management component | Active and archived CRUD lists; deferred search and industry/status filters; active list uses the same unbounded endpoint | Every active card with an image mounts a plain eager `<img>`; `onError` hides it | Active management remains API-compatible; migrate its active read only after the shared cursor contract is proven. Archived remains legacy because it is an administrative lifecycle list |
| `catalog-details-dialog` / `catalog-form-dialog` | Fetch one record or use the selected list snapshot | Direct asset URL/preview | Preserve; dialogs fetch only explicit user selections |
| `useCatalogProducts` / React Query keys | Query key includes search and industry; request ignores React Query `AbortSignal`; full-list cache refreshes on mount | N/A | Add a separate infinite key containing every result factor and forward `AbortSignal`; do not run legacy and V2 reads together |
| `resolveAssetUrl` | External `http(s)` passes through; relative paths resolve to API origin | Browser performs public `<img>` request; private operational media uses separate authenticated infrastructure | Keep this boundary. Gate 2 does not proxy, persist, transform or precache Catalog images |
| `public/sw.js` | Excludes API and uploads; caches same-origin application assets only | Does not own Catalog media | No change required |

## Current query and index contract

`catalog_products.get_catalog_products` filters `is_shared`, `is_active`,
optional industry, and `%term%` across name/brand/description. Ordering is
deterministic through `(created_at DESC, id DESC)`. The existing PostgreSQL
index `ix_catalog_products_shared_active_industry_created` covers
`(is_shared, is_active, industry_id, created_at)` but not the unique tie-breaker
column. Migration `20261118_0020` adds
`ix_catalog_products_cursor_scope(is_shared, is_active, industry_id,
created_at, id)`. At 50k rows PostgreSQL selected an index-only backward scan;
the legacy index remains in place for rollback safety.

## Planned cursor compatibility contract

- Additive endpoint: `GET /catalog-products/page`; old list endpoints remain.
- Keyset order: `created_at DESC, id DESC`; no OFFSET.
- Opaque URL-safe cursor contains version, last timestamp, last ID and a digest
  bound to normalized search, industry, active state and ordering.
- Invalid, malformed, cross-query and unsupported-version cursors reject with a
  stable client error rather than silently restarting.
- Each page is limited and fetches `limit + 1`; response contains `items`,
  `next_cursor`, and `has_more`.
- Concurrent insertions may appear only on a fresh query because they sort
  before the current cursor. Archive/delete between pages can shorten the
  remaining traversal. Strict keyset comparison prevents duplicates from
  equal timestamps.

## Initial phase decisions

| Phase | Status | Evidence |
|---|---|---|
| G2-A read-only discovery | GO | API, repository, consumers, query keys, image paths, service worker, existing virtualizer and indexes inspected |
| G2-B backend pagination | GO | Additive authenticated `/page`, HMAC cursor bound to normalized query, `limit + 1`, stable error, Persian/Arabic yeh/kaf and ZWNJ-compatible search |
| G2-C frontend infinite browsing | GO | Separate infinite query and cache key, 300 ms debounce, request abort signal, retry without discarding prior pages; route selects exactly one reader |
| G2-D virtualization | GO | Responsive 1/2/3-column row virtualizer, two-row overscan, fixed estimate and bounded mounted DOM |
| G2-E lazy image loading | GO | Virtualized mounting plus native lazy/async image decode, fixed 150 px container, deterministic fallback; public Catalog URLs only |
| G2-F performance/regression | GO | 25 PostgreSQL tests passed; 1k/5k/10k/50k measurements and index plan captured; full regression and E2E passed |

## Runtime, cache and rollback behavior

- Page size is 24 (server maximum 100). The cache is fresh for 60 seconds and
  garbage-collected after 10 minutes; all pages are released with the query.
- Changing search or industry changes the query key, cancels the obsolete
  request through `AbortSignal`, resets pagination, and cannot reuse a cursor
  from another query.
- Inserts newer than the current boundary are visible after a fresh query.
  Archive/delete during traversal can reduce the remaining set; the strict
  `(created_at, id)` predicate prevents duplicate boundary rows.
- Images are never added to the service worker, IndexedDB, OPFS, outbox or
  backup. Browser HTTP cache owns URL-level request deduplication. Unmounting a
  virtual row leaves no object URL or application-held bitmap to revoke.
- Rollback is one flag change: disable `CATALOG_CURSOR_READ_V2_ENABLED`. The
  route then mounts legacy `CatalogAdoption` only. The additive endpoint returns
  404 while disabled. The old list endpoint and Gate 1 adoption flag remain.

## PostgreSQL scale evidence

Isolated `tanzim_test` data was generated and destroyed by the PostgreSQL test
fixture. First-page wall times (25 rows) were:

| Catalog rows | Time |
|---:|---:|
| 1,000 | 5.980 ms |
| 5,000 | 3.741 ms |
| 10,000 | 3.976 ms |
| 50,000 | 3.821 ms |

At 50k rows `EXPLAIN (ANALYZE, BUFFERS)` reported an Index Only Scan Backward
on `ix_catalog_products_cursor_scope`, 25 heap fetches, 5 shared-buffer hits,
0.087 ms planning and 0.030 ms database execution. Measurements are local
development evidence, not a production SLO.

## Final evidence

- Full frontend unit/component suite: `418 passed`.
- Full fast backend suite, including cursor/status/filter-bound/Persian-search
  coverage: `110 passed`.
- PostgreSQL migration/concurrency/domain suite: `25 passed in 23.16s`.
- Focused scale replay: `1 passed`, with the table and plan above.
- Typecheck, production build and lint: PASS.
- Focused cursor/rollback E2E: `6 passed` across desktop and mobile.
- Final production-preview E2E at two workers: `134 passed`, `8` established
  external-prerequisite skips, `0 failed` in 4.0 minutes.

Development decision: **GO — DEVELOPMENT ONLY.** Production/staging release
remains **NO-GO / NOT ASSESSED**. No
merge, push or deployment is authorized by this gate.
