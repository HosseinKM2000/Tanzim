# GATE 5 — Catalog Field Validation & Controlled Release Readiness

Date: 2026-11-18  
Branch: `chore/catalog-release-readiness`  
Baseline: `64bc99b593be486b767df690528c5cddf889b220`  
Authorization: development and validation only

## Decisions

| Gate | Decision | Basis |
|---|---|---|
| Development validation | **GO — DEVELOPMENT ONLY** | All available regressions passed; the four formerly skipped journeys were executed in both browser projects; no unresolved critical development defect was found. |
| Field validation | **BLOCKED** | No physical Android or iOS device, installed mobile PWA, storage-pressure harness, or controlled constrained-network lab was available. Browser emulation is not field evidence. |
| Production release | **NO-GO** | Field evidence, production topology/durability, publication-rights approval, live traffic contention telemetry, monitoring ownership, and a production-like rollback rehearsal remain unavailable. |

No merge, push, deployment, production flag activation, production migration, or
Gate 6 work was performed.

## 1. Baseline and verified environment

The worktree started clean on the required Gate 4 commit. Alembic head is
`20261118_0021`. `CATALOG_OFFLINE_FAMILIES_V1_ENABLED` still defaults to false.
The operational Dexie database remains v14 and the separate Catalog database remains
v1.

Local validation environment:

- Windows host; Node `v24.12.0`; Python `3.13.13`;
- PostgreSQL `18.6` in the existing healthy local Docker container;
- Playwright `1.62.1`, Chromium desktop and Pixel 7 browser emulation;
- production Vite builds served by `vite preview`;
- isolated `tanzim_gate5_test` and `tanzim_gate5_restore` databases;
- explicit disposable private/reference-media roots under `.gate5-runtime`;
- local backend build ID `gate5-local-validation`, schema header `20261118_0021`;
- all disposable databases, dumps, builds, and media roots removed after evidence capture.

This is a production-like local process layout, not proof of the real production
deployment topology. Repository Compose still declares PostgreSQL only.

## 2. Verification ledger

| Command / environment | Result |
|---|---|
| `npm.cmd run test:regression` | PASS: 94 files / 425 frontend tests; test typecheck; 113 backend tests; production build; lint. |
| `npm.cmd run test:backend:postgres:local` | PASS: 26/26 against disposable local PostgreSQL; 121.09 s. |
| `E2E_BASE_URL=http://127.0.0.1:4177 E2E_WORKERS=2 npm.cmd run test:e2e` | PASS: 144 passed, 8 prerequisite skips, 0 failed in 4.0 min. This final baseline run deliberately omitted live prerequisite variables; those journeys are evidenced separately below. |
| Authentication live journey, both projects, one worker | PASS: 2/2. It is intentionally sequential because the prerequisite is one isolated external account whose test logs out. |
| Live media recovery and live operation resolution, disposable backend, both projects | PASS: 4/4 in the corrected focused run. |
| Real two-build PWA update, two workers, ephemeral per-test ports | PASS: 2/2 in 9.3 s. |
| `node scripts/catalog-offline-benchmark.mjs` against production preview | PASS: 100/1k/5k/10k/50k metadata measurements and 1 MiB OPFS read/write captured for both profiles. |
| Invalid bearer request to current-release API | PASS: HTTP 401. |
| Disposable DB/media dump and restore | PASS: restored at `0021`; database and all four private media files verified. |

The initial live run correctly failed and was retained as diagnostic evidence. It
found test-prerequisite defects: overlong generated usernames, missing paid/sync
entitlement setup, ambiguous semantic selectors, a hard-coded API origin, and a
fixed PWA test-server port. No retry, assertion weakening, timeout increase, or new
skip was used. The corrected tests provision entitlement through the administrator
API and continue to exercise normal authorization.

## 3. End-to-end customer journey audit

| Journey step | Evidence | Status |
|---|---|---|
| Select industry | Live disposable media/sync journeys select a newly created industry through the API. | PASS |
| Browse/search shared Catalog without Inventory writes | Hosted Catalog E2E inspects local Inventory before adoption; cursor, search, virtualization, and flag rollback remain covered. | PASS |
| Preview/detail reference image | Authenticated reference success, fallback, automatic verified cache, and no repeated transfer are covered. | PASS |
| Explicit online adoption | Existing ProductForm/local-first path and stable Catalog ID are exercised. | PASS |
| Download selected family | Desktop/mobile hosted E2E reaches verified `complete`. | PASS |
| Disconnect, reload, browse/search | Production service-worker E2E reloads offline and renders Dexie metadata plus OPFS image. | PASS (emulation) |
| Adopt downloaded item offline | Unit/component coverage proves the existing ProductForm/outbox path; a single fully live Catalog-to-reconnect journey was not provisioned. | PARTIAL |
| Reconnect and resolve Outbox | Live operation-resolution journey proves read-only committed-result resolution without replay; generic PWA sync remains covered. | PASS |
| Incremental release update | Hash reuse and atomic active/pending release behavior are unit-tested; no live second Catalog publication was staged. | PARTIAL |
| Switch Store/account | Scope-key partition and access-change abort tests pass; no live multi-Store browser journey was run. | PARTIAL |
| Remove downloaded content | Pin-aware cleanup is unit-tested; physical-device eviction/removal remains unverified. | PARTIAL |

Catalog browsing remains read-only. No browsing route creates Inventory, category,
label, outbox, media, invoice, barcode, price, or stock records.

## 4. Live integration and deployment evidence

The disposable backend used PostgreSQL, durable local directories, a production
frontend build, real HTTP authentication, real media transfer/download, real Sync
acceptance/resolution, and actual OPFS/IndexedDB. Health returned 200 with build and
schema headers. An invalid token returned 401. The live media test uploaded a WebP,
created an Inventory record through Sync, hydrated a fresh browser profile, verified
SHA-256, and reopened the image from OPFS while offline in both projects.

Available automated backend coverage also verifies expired/invalid authentication,
cross-industry denial, exact release/family asset authorization, forged-family and
unreferenced-asset denial, private immutable cache headers, publication pointer
atomicity, rollback behavior, and missing-media handling.

Not established by this local topology:

- real reverse proxy, TLS, HTTP/2/3, compression, CDN or mount ownership;
- server restart during a large Catalog download;
- production filesystem capacity, permission identity, IOPS and retention;
- backend CPU/RAM/bandwidth under representative multi-customer traffic;
- real conditional-cache behavior through the target proxy;
- production monitoring, alert routing, RPO/RTO or incident ownership.

These remain production blockers rather than inferred passes.

## 5. Physical-device matrix and manual checklist

| Target | Browser / mode | Result |
|---|---|---|
| Lower-end Android | Chrome browser + installed PWA | BLOCKED — device unavailable |
| Midrange Android | Chrome browser + installed PWA | BLOCKED — device unavailable |
| Modern Android | Chrome browser + installed PWA | BLOCKED — device unavailable |
| Supported iPhone | Safari + Home Screen web app | BLOCKED — device unavailable |
| Windows desktop | Headless Chromium production preview | PASS for automated development scope; not a field pilot |
| Pixel 7 | Playwright emulation only | PASS for responsive automation; explicitly not physical-device evidence |

For every physical target, an operator must record device model, OS/browser version,
RAM and free storage where visible, PWA mode, Wi-Fi and constrained cellular runs,
cold/warm Catalog load, continuous scroll, search P50/P95 from at least 20 samples,
first/warm image render, download pause/resume, process kill during metadata and OPFS
writes, offline restart, quota/eviction behavior, incremental update, logout, and
account/Store switching. Capture screen recording, browser logs, timestamps, storage
before/after, request counts, and the exact release/family IDs. Any cross-scope byte
visibility, active-release corruption, lost outbox payload, or unusable UI is a stop.

## 6. Scale and storage measurements

Fresh 2026-11-18 measurements:

| Products | Manifest bytes | Parse desktop/mobile ms | IndexedDB write desktop/mobile ms | First-24 search desktop/mobile ms |
|---:|---:|---:|---:|---:|
| 100 | 20,893 | 0.4 / 0.2 | 73.0 / 66.7 | 10.9 / 8.3 |
| 1,000 | 212,721 | 0.5 / 0.8 | 128.3 / 113.8 | 53.9 / 55.4 |
| 5,000 | 1,081,295 | 3.8 / 3.3 | 632.6 / 815.1 | 85.0 / 96.3 |
| 10,000 | 2,167,025 | 7.0 / 7.4 | 3,549.3 / 3,677.2 | 135.5 / 131.5 |
| 50,000 metadata-only | 11,012,793 | 36.3 / 41.5 | 49,438.3 / 52,104.8 | 125.1 / 144.0 |

One MiB OPFS write/read was 7.7/2.6 ms desktop and 6.7/3.6 ms under mobile
emulation. Reported heap after each profile was 18.2 MiB; this is not peak memory.
The 50k write reproduces Gate 4's approximately 52-second result. P50/P95, long-task
distribution, first/warm render timing, complete family duration, quota behavior and
physical-device memory were not produced by this single-sample benchmark and are
not presented as measured.

### V1 large-family decision

For a controlled pilot, publication operations should admit only families at or
below **5,000 products and 3 MiB sealed metadata**, and must separately preflight
asset bytes against browser quota. This is an evidence-based temporary pilot guard:
the current 5k metadata write stayed below one second in both profiles, while 10k
took about 3.6 seconds and 50k about 52 seconds. It is not a permanent architecture
or a claim about physical phones.

Families above that pilot envelope remain blocked until a separate design supplies
bounded immutable metadata chunks, small IndexedDB transactions, limited in-memory
batches, checkpoint/recovery between chunks, and unchanged-record avoidance.
Incremental parsing should be evaluated where the transport format supports it. A
simple arbitrary cap is not the long-term solution.

## 7. Offline and failure injection

Verified automated cases include network loss after download, offline restart,
missing local Blob recovery, bad SHA-256, sealed-manifest tamper rejection,
interrupted temporary-file reconciliation, durable pause/cancel entries, shared
transfer cancellation safety, previous-release preservation, archived reference
rejection, and concurrent adoption convergence on PostgreSQL.

The following require field or a dedicated process-kill/storage harness and remain
BLOCKED: browser process termination at exact metadata/OPFS commit boundaries,
real quota exhaustion, browser-data clearing UX, real Store switch/logout during a
large transfer, online entitlement revocation after a long offline lease, orphan
OPFS bytes with no IndexedDB row under browser eviction, and two physical devices
adopting the same item. Operators must verify that none can replace the last healthy
release and that rejected outbox payloads remain non-retrying recovery evidence.

## 8. Network priority and operational Sync

The queue unit tests verify four total/two bulk bounds, visible-over-bulk priority,
deduplication, and no new bulk work while Sync reports `syncing`. The live operation
resolution test confirms no `/sync/batch` replay is issued while resolving an
already committed command.

Representative A/B measurements of Inventory-save latency, Sync duration, backend
CPU/RAM, media bandwidth and error rate with a genuinely large family were not
available. Therefore operational traffic precedence is structurally verified but
not field-measured, and production release is blocked on this evidence.

## 9. Security, isolation and licensing

- Store/account/industry scope remains server-derived and deny-by-default.
- Exact release/family authorization is required before a reference asset is cached.
- Invalid bearer evidence returned 401; private reference files were not made public.
- Local metadata and OPFS paths remain partitioned by authenticated person, Store and
  industry; a content hash alone never grants access.
- Manifest hashes, MIME, byte size and final OPFS content are validated.
- Paths are generated/validated below dedicated roots; private Inventory media is
  not reused by the reference cache.
- Logout/account access changes stop consumers; offline authorization is bounded by
  the existing lease rather than falsely claiming instant revocation.
- Browser-profile data is not encrypted against an OS/profile attacker; this is the
  documented local threat boundary.

Reference publication rights remain **BLOCKED**. The schema retains source evidence
and approval state, and ingestion denies missing approval, but no legal/business
owner supplied a representative approved rights dossier. Production publication
must not proceed without that approval and retention policy.

## 10. Backup, restore and rollback evidence

The isolated Gate 5 database was dumped in PostgreSQL custom format and restored to
`tanzim_gate5_restore` with `--exit-on-error`.

- dump size: 202,019 bytes;
- dump SHA-256: `8524f18bc5fda99554074a4173a8ca34edb1f52ec78a0e731238c3d561375899`;
- restored Alembic revision: `20261118_0021`;
- restored users/media assets/release pointers: 10 / 4 / 0;
- private media restore: 4 source files, 4 restored files, zero SHA-256 differences.

No Catalog release was published in this disposable live run, so restoration of a
non-empty release pointer plus reference asset tree remains BLOCKED. Gate 3's atomic
publication tests remain green but are not substituted for an operations rehearsal.
Previous-client compatibility is code/test reviewed; a real previous deployed build
against this backend was not staged.

Behavior rollback is flag-first and does not delete local data: disable offline
families, reference media, cursor read, then on-demand adoption in reverse dependency
order as required. Deploying the prior compatible client may follow. Do not downgrade
`0021` as a runtime rollback; schema rollback is a separate backed-up maintenance
operation. Downloaded Catalog DB/OPFS data is retained for forward recovery.

## 11. Controlled rollout plan — not executed

1. Obtain rights approval, named release owner, incident commander, support owner,
   database/media backup owner and on-call contacts.
2. Verify exact commit/build/schema, durable private and reference mounts, service
   identity permissions, free space, backup restore, proxy headers and TLS.
3. Install dashboards for API 4xx/5xx, release publication, manifest/asset latency,
   bytes and concurrency, reference storage, download state/error codes, Sync latency,
   outbox depth and client build/flag cohorts. Thresholds must be set from pilot
   baseline; none are invented here.
4. Keep all Catalog flags off. Enable Gate 1 adoption for internal canaries, then
   Gate 2 cursor read, Gate 3 reference media, and Gate 4 offline families only after
   each preceding health check. Never auto-enable a later dependency.
5. Use a small explicitly authorized pilot of representative shops and only families
   inside the temporary 5k/3 MiB envelope. Record device/network/storage diversity;
   no user count is proposed without operational capacity evidence.
6. Stop on cross-tenant access, pointer/manifest mismatch, loss of last healthy local
   release, outbox loss, sustained Sync degradation, unexplained storage growth,
   rights violation, or inability to restore. Roll back flags before considering a
   client rollback; preserve evidence and local data.
7. Post-deployment verification must repeat authentication, browse-no-write,
   adoption, download, offline restart, reconnect, update, Store switch and removal,
   plus backup checks. Support instructions must distinguish browser eviction from
   server data loss and must never recommend clearing storage before evidence export.

## 12. Fixes, regressions and remaining blockers

Gate 5 made no product/schema change. It corrected only live-test infrastructure:

- exact main/logout selectors;
- bounded unique usernames;
- explicit authorized subscription setup for Sync-dependent journeys;
- configured live API routing instead of hard-coded localhost:8000;
- ephemeral PWA test-server ports for two-worker isolation.

Remaining release blockers are physical-device evidence, constrained-network and
large-download contention measurements, non-empty Catalog database/reference-media
restore rehearsal, previous-client live compatibility, real proxy/mount topology,
publication-rights approval, monitoring thresholds/ownership, and a named pilot and
incident process.

**Stop rule observed:** no merge, push, deploy, production migration, production
feature activation, or later Gate was performed.
