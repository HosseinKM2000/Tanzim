# GATE 3 — Catalog families, reference media and safe publication

**Gate status:** GO — DEVELOPMENT ONLY

**Authorization:** DEVELOPMENT ONLY

**Captured:** 2026-11-18, Asia/Tehran

**Branch:** `feat/catalog-reference-media-publication`

**Starting commit:** `22f24ef`

**Initial worktree:** clean

**Initial Alembic head:** `20261118_0020` (repository and local development database)

## Initial contract and impact analysis

The reported Gate 2 baseline matches the repository: commit `22f24ef`, schema
head `20261118_0020`, default-off adoption/cursor flags, 418 frontend tests,
110 fast backend tests, 25 PostgreSQL tests, and 134 hosted E2E passes with the
eight established external-prerequisite skips.

| Existing boundary | Evidence | Gate 3 decision |
|---|---|---|
| `CatalogProduct` | Global shared definition with legacy `image_url`; Store inventory points to it | Preserve every field and ID; add relationships only |
| `InventoryItem` | Store-owned operational row with private `MediaAsset` and Sync projection | No semantic/schema/outbox change |
| `MediaAsset` | Store/actor-scoped, authenticated, content-addressed private WebP | Do not reuse for public reference media |
| Category and Label | Store-owned classification/labels; reference taxonomy is separate | Families are a new global reference registry, never Store labels |
| Catalog APIs | Legacy full list plus Gate 2 cursor page and explicit adoption | Add fields/endpoints only; flag off returns legacy images |
| Image resolution | Legacy URLs use API origin; private media uses authenticated API | Add a reference-origin resolver without changing private media |
| Storage | Private durable volume with traversal-safe adapter | Add a separate reference volume and namespace |
| Backup/restore | Projects Store inventory only and cannot restore authority | Reference registry/releases are excluded; no cross-boundary restore |

## Final model decision

- `CatalogFamily`: stable industry-scoped slug/name identity, active state and
  sort order. Deactivation hides future publication; it never rewrites product
  membership or Store data.
- `CatalogProductFamily`: composite primary key prevents duplicate many-to-many
  membership. A product may belong to several families, but industry must match
  at service validation time.
- `ReferenceMediaAsset`: UUID identity, original-source SHA-256, variant
  SHA-256, MIME, dimensions, bytes, relative storage key, variant, validation
  status, source evidence and creator. `(source_sha256, variant_type)` and the
  immutable content hash deduplicate ingestion.
- `CatalogProductMedia`: explicit preview/detail role and order. V1 permits one
  primary association per product/role while one asset may be shared.
- `CatalogRelease`: immutable industry version, state, manifest key/hash,
  previous release, request identity, publisher and timestamps.
- `CatalogReleasePointer`: one industry row atomically selects the current
  published release. It is intentionally separate from immutable release data.

No vehicle-specific columns are added to `CatalogProduct`; technical details
remain in `description`.

## Publication and recovery contract

1. Validate administrator authority, flag, families, products, associations,
   approved assets and physical bytes.
2. Generate deterministic family manifests and an index from a fixed release
   timestamp and stable ordering.
3. Write all files below an isolated staging directory, fsync files, re-read
   and hash them, then atomically rename the directory to the immutable release
   key.
4. In one database transaction mark the release published and replace the
   industry pointer. The old pointer remains until this transaction commits.
5. A crash before rename leaves only removable staging data; a crash after
   rename but before the DB commit leaves an unreferenced immutable release,
   never a false active release. Repeating the same request validates and
   resumes it. No automatic physical garbage collection runs in V1.

PostgreSQL cannot make filesystem writes transactional; the ordering above is
the atomicity boundary and recovery contract.

## Access and serving decision

The repository has no production reverse-proxy contract and the public-access
policy is not approved. Reference bytes therefore remain non-public. A
dedicated authenticated API verifies the feature flag, an approved asset,
active shared-product association, and the authenticated membership's industry
(platform administrators use their isolated management authority). It returns
immutable private cache headers. Static/reverse-proxy and CDN origins remain a
future configuration option through relative storage keys and a client origin
resolver; database rows never store a hostname.

## Phase evidence

| Phase | Status | Evidence |
|---|---|---|
| G3-A contract and impact analysis | GO | Models, APIs, private media, storage, backup/restore and UI consumers inspected; final minimal model and crash contract recorded |
| G3-B database and registry | GO | Additive Alembic `20261118_0021`; six isolated registry/publication tables; no Store, Inventory, Sync, outbox or Dexie change |
| G3-C asset ingestion | GO | Signature/MIME/dimension/size/animation validation; rights evidence; metadata-stripped WebP variants; content-addressed deduplication |
| G3-D publication | GO | Deterministic sealed manifests, immutable release directories, idempotent request IDs, atomic DB pointer switch and recovery tests |
| G3-E serving/frontend | GO | Authenticated industry-scoped reads, private immutable caching, independent reference origin, reference-first UI with legacy fallback |
| G3-F validation | GO | Full regression, PostgreSQL migration/scale, desktop/mobile E2E and local migration all pass |

## Final evidence and decision

## Implemented surface

- Default-off `CATALOG_REFERENCE_MEDIA_V1_ENABLED`, independent of Gate 1 and
  Gate 2 flags. Flag off does not load reference relationships and exposes no
  reference URLs or bytes.
- Additive `20261118_0021` tables: `catalog_families`,
  `catalog_product_families`, `reference_media_assets`,
  `catalog_product_media`, `catalog_releases`, and
  `catalog_release_pointers`. Existing business tables and identifiers are
  unchanged.
- Platform-admin-only mutation endpoints create/link families, ingest media,
  and publish releases. Customer reads derive industry from the authenticated
  active Store membership; client industry/store/actor claims are not trusted.
- Ingestion accepts JPEG, PNG, and WebP only after decoding and matching the
  actual signature to the declared MIME. It rejects empty, corrupt, animated,
  oversized, decompression-bomb, spoofed, or unapproved-source inputs. Preview
  and detail variants are metadata-free WebP and share physical bytes when
  hashes match.
- Release index and family manifests use canonical JSON, stable ordering,
  content hashes, explicit counts and immutable relative storage keys. A
  current-release pointer is switched only after the complete filesystem
  release exists and validates.
- Reference bytes are not public static files. The authenticated endpoint
  checks approval, active shared-product linkage, and membership industry,
  then serves `ETag`, SHA-256, `nosniff`, and private immutable cache headers.
- The browser fetches private reference bytes with the session Bearer header
  and renders a short-lived Blob URL. It revokes the URL on cleanup and does
  not add an OPFS, IndexedDB, service-worker, or durable download cache.
- Customer browsing prefers the reference preview and falls back to the legacy
  image on absence or load failure. Management detail prefers detail, then
  preview, then legacy. Reference origin configuration remains independent of
  private operational media.

## Import and identity contract

Gate 3 deliberately provides the registry primitives rather than a bulk
vehicle/catalog importer. A future importer must resolve an existing stable
`CatalogProduct.id`, then idempotently link an industry-scoped family slug and
ingest media with source/rights evidence. It must not derive identity from a
filename, URL, translated name, image hash, Store row, or client-provided
Store/actor claim. Adding a provider/external-key registry requires a separate
additive migration and collision policy; it is not silently inferred here.

## Scale evidence

The PostgreSQL benchmark generated two overlapping family manifests with 100
deduplicated reference assets. Query count remained exactly three at every
size (families, memberships/products, media/assets).

| Products | Family relations | Manifest bytes | Generation | Peak traced memory | Queries |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 1,500 | 572,508 | 762.28 ms | 4,223,567 | 3 |
| 5,000 | 7,500 | 2,870,510 | 2,639.57 ms | 18,618,923 | 3 |
| 10,000 | 15,000 | 5,743,019 | 4,822.39 ms | 35,899,473 | 3 |
| 50,000 | 75,000 | 28,843,021 | 25,500.72 ms | 177,984,880 | 3 |

The bounded-query goal passes. The 50k in-memory generation peak (~170 MiB)
and ~25.5 s latency are accepted for an offline administrator publication job,
not a request-path SLO. Production enablement must set worker memory/time
budgets and monitor these values; streaming/chunked manifest construction is
the next optimization if the operational budget is lower.

## Verification evidence

- Local development PostgreSQL upgraded transactionally from
  `20261118_0020` to `20261118_0021 (head)`.
- `npm.cmd run test:regression`: 418 frontend and 113 fast backend tests pass;
  test typecheck, production build, and lint pass.
- `npm.cmd run test:backend:postgres:local`: 26/26 pass, including fresh
  migration, concurrency behavior and 1k/5k/10k/50k publication scale.
- Production-preview Playwright at two workers: 140 pass, eight established
  external-prerequisite skips, zero failures. The Gate 3 catalog file is 12/12
  across desktop/mobile (reference success, load failure fallback, flag off).

## Rollback, operations and residual risks

Runtime rollback is immediate: keep `CATALOG_REFERENCE_MEDIA_V1_ENABLED=false`.
Legacy Catalog image behavior then remains authoritative. Schema downgrade is
not part of runtime rollback and would destroy Gate 3 registry/release rows;
it requires an explicit backup and maintenance decision.

Reference storage and the six database tables form one operational backup
set. Store/customer backup restore remains unchanged and must never import
reference authority, memberships, credentials, subscriptions, or release
pointers. No automatic blob/release garbage collection is implemented; this
avoids deleting bytes referenced by a committed or recoverable release but
requires later audited retention tooling. Public/CDN serving remains NO-GO
until an explicit proxy/access policy is approved.

No merge, push, deployment, production migration, Gate 4 work, family download
manager, service-worker change, or reference OPFS cache was performed.
