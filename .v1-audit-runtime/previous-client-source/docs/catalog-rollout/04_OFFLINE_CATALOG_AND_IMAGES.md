# GATE 4 — Offline Catalog, Reference Image Cache & Family Download Manager

Date: 2026-11-18  
Branch: `feat/catalog-offline-families`  
Baseline: `38595c733074e55fb656099aca3baadb5b41d6db` (`feat/catalog-reference-media-publication`)  
Authorization: development only

## Decision

**GO — DEVELOPMENT ONLY**, subject to the evidence and residual limits below.
Production release remains **NO-GO / NOT ASSESSED**. No merge, push, deployment,
production migration, or Gate 5 work was performed.

## Repository findings and implementation contract

Gate 3 already supplied immutable, industry-scoped release and family manifests,
authenticated WebP assets, and an atomic current-release pointer. Its family
manifest lacked `industry_id`, legacy image URL, packaging, pack size, and creation
time needed by the existing adoption form. `publish_catalog()` now adds only those
backward-compatible fields. A client requests one immutable family manifest by
`release_id + family_slug`; it never downloads the complete industry index for a
single family.

The existing image hook created transient authenticated Blob URLs but had no
persistent identity, shared request queue, abort sharing, hash validation, or OPFS
contract. Inventory images live under `inventory-images` and their cleanup is
private-media specific. Gate 4 therefore does not reuse that repository or cleanup.
When the flag is on, online card projections now include immutable asset metadata
and an active family slug; the current release is resolved once and visible images
use the same verified loader as bulk/offline paths. Flag-off cards keep the Gate 3
transient path.

Data flow:

```text
active membership + local entitlement lease
  -> adoption-status (default-off Gate 4 flag)
  -> current published release
  -> immutable family manifest (SHA-256 checked)
  -> persistent job/entries in catalog-only Dexie database
  -> shared priority queue (4 total / 2 bulk by default)
  -> authenticated, release/family-scoped asset endpoint
  -> response size + MIME + SHA-256 verification
  -> temporary OPFS write + final verification
  -> metadata commit
  -> atomic local release activation
  -> paged offline family query / existing ProductForm adoption
```

No step creates Inventory, writes the operational outbox, uploads private media,
or changes Inventory image, backup, barcode, invoice, stock, or pricing contracts.

## Access and tenant policy

- Network scope is derived by FastAPI from the authenticated user and active Store
  membership. Customer-supplied industry mismatches return 404. The new exact
  release endpoint accepts no Store or actor claim.
- Asset persistence is authorized against the exact immutable release and family;
  the asset must occur in that published/superseded family manifest.
- Offline display requires `currentCatalogScope()`: the locally verified user,
  active Store, industry, and existing `tools.catalog` entitlement/lease must all
  remain valid. A file hash alone never grants access.
- Metadata, jobs, release snapshots, and physical OPFS bytes are partitioned by
  `user_id:store_id:industry_id`. Cross-account physical deduplication is deliberately
  not used because global sharing of restricted bytes was not proven. This costs
  storage but prevents hash-based privilege inheritance.
- `accessState` changes abort active consumers, pause their job, and disable
  auto-resume. Reconnection rechecks live authorization before new downloads.
- Offline revocation is bounded by the existing entitlement/personnel lease. The
  client does not claim immediate revocation while disconnected.

## Storage contract

`reference-image.repository.ts` owns only:

```text
catalog-reference/
  user-{userId}/store-{storeId}/industry-{industryId}/
    blobs/{sha256}.webp
    temporary/{sha256}-{uuid}.pending
```

A final file is reusable only when expected size, WebP MIME (when supplied), and
SHA-256 match. Writes are verified in `temporary`, copied to the content-addressed
final name, and verified again before IndexedDB is updated. Interrupted temporary
files are removed during reconciliation. Blob URLs are created on demand and
revoked by the React hook; startup does not read image bodies. Missing or evicted
files are treated as cache misses and recovered through the same loader.

Quota estimation is advisory; the final OPFS write remains authoritative. The
automatic cache defaults to 64 MiB (`VITE_CATALOG_REFERENCE_CACHE_BYTES`) and evicts
only `pinCount === 0` assets by least-recent access. Explicit family assets are
pinned and excluded. The application-wide storage persistence request remains the
existing best-effort mechanism; browser clearing/eviction can never be presented as
absolute persistence.

## Local metadata and journal

An independent additive database, `tanzim-catalog-offline-v1`, avoids changing
`inventory-db` v14 or making an older application open an unknown operational
schema. Stores are `families`, `products`, `releases`, `assets`, `jobs`, and
`entries`. Every record used for access is scope-keyed; compound indexes support
family/release pages and stable Catalog product lookup.

The durable state machine is:

```text
queued -> downloading -> verifying -> complete
             |  |             |
             |  +-> partial/failed -> retry -> downloading
             +-> paused -> downloading
             +-> cancelled
complete -> update_available -> downloading -> verifying -> complete
```

Verified entries survive pause, cancellation, refresh, and retry. Startup removes
temporary files, reconciles entries with OPFS, and resumes only `autoResume` jobs
while online and still in the same access scope. The family keeps separate
`activeReleaseId` and `pendingReleaseId`; activation verifies every required asset
inside one Dexie transaction. The previous active products and pins remain intact
when a new download fails or the process closes.

Preflight fetches metadata only, validates the sealed manifest, compares each
content hash with verified local metadata and the actual OPFS file, reports only
missing bytes, checks quota, then waits for the user's download action. Basic mode
stores metadata plus previews; full mode also requires details.

## Loader, network, and update behavior

`CatalogReferenceLoader` is shared by visible, near-viewport, detail, recovery, and
bulk consumers. Priority is visible, near, detail, recovery, bulk. Defaults are
configurable through `VITE_CATALOG_REFERENCE_MAX_REQUESTS` (4) and
`VITE_CATALOG_REFERENCE_MAX_BULK_REQUESTS` (2). Requests deduplicate by authorized
scope and content hash. Cancelling one consumer detaches it without aborting a
transfer still shared by another consumer.

Bulk starts no new work while operational Sync reports `syncing`. Transient failures
retry at most three times with exponential backoff and jitter; 401, 403, and 404 are
permanent. No background-sync completion promise is made. Update discovery compares
the active release, downloads only missing hashes, and switches releases only after
full verification. Cleanup is delayed until pin counts permit it.

## Offline browsing and adoption

`CatalogOfflineBrowser` queries one active family/release from Dexie in pages of 24,
renders the accumulated page set through TanStack Virtual, normalizes Arabic/Persian
yeh and kaf, and displays metadata even when an image is missing. It does not
materialize all downloaded families at startup or retain an unbounded card DOM.
Family switching, search, preview display, and basic/full readiness are local.

The adoption link remains `/inventory/add?catalogId=...`. `getCatalogProduct()` falls
back to the active offline release only while network is unavailable. The existing
ProductForm and local-first Inventory outbox remain the sole creation path; Sync still
revalidates the stable Catalog ID and preserves rejected operations for recovery.

## Feature flag and rollback

`CATALOG_OFFLINE_FAMILIES_V1_ENABLED` is parsed by the established environment-flag
helper and defaults false. The authenticated status contract exposes it.

- OFF: Gate 3 browsing/images remain unchanged; the manager renders no download
  workflow and no persistent loader path runs. Existing downloaded data is retained.
- ON: authorized users can manage family downloads and the Catalog route selects the
  verified offline reader when connectivity is lost.

Rollback is to set the server flag false and deploy the previous client. Do not
delete OPFS or IndexedDB. No PostgreSQL or Alembic rollback is required. Older builds
ignore the separate database and namespace; the service worker still excludes API
and authenticated reference responses, so it does not cache private bytes.

## Security and failure evidence

- Backend integration asserts unauthenticated denial, customer industry isolation,
  exact-release manifest access, release/family-scoped asset success, forged family
  denial, and an asset not present in the family denial.
- Unit tests assert account/Store partition isolation, manifest sealing/tamper
  rejection, atomic previous-release preservation, Persian normalization, durable
  pause/cancel entries, shared-transfer deduplication, consumer cancellation safety,
  and visible-over-bulk priority.
- Production-build Playwright verifies that an online visible published image is
  cached once and reused after reload without a second transfer. It also downloads
  a family through an authenticated scoped
  asset request, reaches verified `complete`, disconnects, reloads under the service
  worker, and displays local metadata and the OPFS image in desktop Chromium and
  Pixel 7 emulation.
- The final write checks size/hash both before and after finalization. Missing OPFS
  files are reset to pending on resume. Quota, permission, or interrupted writes do
  not activate the pending release.

## Performance measurements

Measured 2026-11-18 in headless Chromium against the production preview using
`scripts/catalog-offline-benchmark.mjs`. “Mobile” is Pixel 7 browser emulation on the
same desktop CPU, not physical-device evidence. Synthetic metadata records are
smaller than the Gate 3 production manifest records, so sizes are not substituted
for Gate 3's 28.8 MiB/50k publication figure.

| Products | JSON bytes | Parse desktop/mobile ms | IndexedDB write desktop/mobile ms | First 24 search desktop/mobile ms |
|---:|---:|---:|---:|---:|
| 100 | 20,893 | 0.2 / 0.2 | 15.5 / 99.9 | 45.8 / 9.0 |
| 1,000 | 212,721 | 1.0 / 1.0 | 210.2 / 120.6 | 154.7 / 53.9 |
| 5,000 | 1,081,295 | 7.2 / 3.5 | 1,442.0 / 901.0 | 248.9 / 110.0 |
| 10,000 | 2,167,025 | 57.9 / 7.2 | 4,978.7 / 3,807.3 | 146.1 / 137.7 |
| 50,000 metadata-only | 11,012,793 | 35.0 / 51.4 | 51,919.2 / 52,053.2 | 149.0 / 134.8 |

One MiB OPFS write/read was 15.7/4.6 ms desktop and 6.3/2.7 ms mobile emulation.
Reported JS heap after the run was 18.2 MiB in both profiles; Chromium did not expose
a reliable per-operation peak. The focused E2E family used one unique preview, one
authenticated image request, and zero repeat requests after offline reload. Queue
tests prove the configured total/bulk bounds structurally. Operational Sync timing
with a live server and physical mobile memory remain unavailable and are not invented.

The 50k write result is intentionally a warning: a single family of that size should
not be enabled on mobile without a chunked immutable family delivery/storage design.
Current delivery remains family-scoped and acceptable for measured smaller families;
no speculative Gate 3 publication redesign was made.

## Verification

Final closing regression:

- Frontend unit/component: 425 passed in 94 files.
- Fast backend: 113 passed.
- Local isolated PostgreSQL: 26 passed; no schema change.
- Focused offline E2E: 2 passed (desktop and mobile emulation).
- Full production-preview E2E at two workers: 144 passed, the established eight
  documented external-prerequisite tests skipped, zero failed.
- Typecheck, lint, and production build: passed.
- Alembic head: unchanged `20261118_0021`.
- Dexie: new separate local database v1; operational `inventory-db` stays v14.

## Changed modules

- Backend: `config.py`, `models.py`, `schemas.py`, `routers/catalog_products.py`,
  `routers/catalog_reference.py`, `services/catalog_reference_service.py`.
- Offline client: all modules under `src/features/catalog-offline/`.
- Integration: `catalogs.api.ts`, Catalog types, reactive network status,
  `/tools/catalog`, `/setting/catalog-images`, navigation metadata, generated route tree.
- Tests/measurements: `backend/tests/test_sync.py`, `catalog-offline.test.ts`,
  `catalog-reference-loader.test.ts`, navigation and Catalog Playwright tests,
  `scripts/catalog-offline-benchmark.mjs`.

## Remaining risks and limits

1. Physical-device mobile storage eviction, memory, and performance were not available.
2. Chromium cannot guarantee persistence; user/browser clearing still removes data.
3. A 50k-product single family is outside the current practical write budget and
   requires bounded chunk delivery before rollout to such a dataset.
4. Service-worker/API behavior is deliberately unchanged; offline boot depends on
   the existing app-shell cache having been installed.
5. Cache data is partitioned rather than encrypted at rest; the policy protects app
   tenant access, not an attacker with operating-system/profile access.

These are rollout constraints, not reasons to weaken authentication or make assets
public. Production remains NO-GO until representative real family distributions,
physical mobile behavior, and rollout monitoring are assessed.
