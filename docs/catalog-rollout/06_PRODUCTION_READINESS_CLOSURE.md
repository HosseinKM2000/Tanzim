# GATE 6 - Production Readiness Closure

Date: 2026-11-18  
Branch: `chore/catalog-production-readiness-closure`  
Baseline: `938ffaf21e35814e773e186fd6e39e6232c55cf2`  
Alembic: `20261118_0021`  
Authorization: development and validation only

## Decisions

| Decision | Result | Basis |
|---|---|---|
| Development Validation | **GO - DEVELOPMENT ONLY** | Two non-empty Catalog releases, coordinated local backup/restore and rollback, previous-client compatibility, local contention probes, PostgreSQL, hosted E2E and the complete regression suite were exercised. No unresolved development defect was established. |
| Field Validation | **BLOCKED** | No physical low-end Android, midrange Android or iPhone, no real storage-pressure harness, and no representative constrained-network field lab were available. Browser emulation is not field evidence. |
| Production Readiness | **NO-GO** | Real deployment topology, durable media mounts, proxy/TLS/cache behavior, capacity, production backup ownership, monitoring/alerting, representative large-family contention, physical-device evidence and image-rights approval remain unverified. |

All four Catalog feature flags remain off by default. No merge, push, deployment,
production migration, pilot, production publication or feature activation was
performed.

## 1. Closure ledger

| Item | Owner | Actual evidence | Status | Action/fix | Remaining risk |
|---|---|---|---|---|---|
| Real application deployment topology | Platform Operations | Repository discovery found only `docker-compose.yml`, which declares PostgreSQL only. No application deployment or production inventory was accessible. | **BLOCKED** | None; guessing was prohibited. | Process count, failure domains, service identities and routing are unknown. |
| Durable PostgreSQL volume | Database Operations | Local Compose volume `tanzim_postgres_data` is a Docker local volume and PostgreSQL 18.6 was healthy. This is local evidence only. | **BLOCKED** | Local volume inspected read-only. | Production volume class, replication, IOPS and ownership are unknown. |
| Durable private/reference media | Platform Operations | Production configuration requires explicit private media and, when enabled, reference media roots. No production mounts or mount permissions were accessible. | **BLOCKED** | Separate local roots were used for source, R2 restore and R1 rollback. | Production persistence, capacity, snapshots and cross-host recovery are unknown. |
| Reverse proxy, TLS and cache headers | Security / Platform Operations | No proxy/TLS configuration or target endpoint was present. Application-level private immutable headers have automated coverage, but no proxy path was observed. | **BLOCKED** | None. | Header rewriting, buffering, compression, TLS policy and cache leakage are unknown. |
| Server resources and traffic capacity | SRE | A local backend process was sampled during a bounded contention probe. No production host or representative traffic was accessible. | **BLOCKED** | Reproducible local probe added. | Production CPU/RAM/network/connection-pool headroom is unknown. |
| Coordinated Catalog recovery | Database + Storage Operations | R1 and R2 custom-format dumps, separate media snapshots, isolated restore roots, non-empty pointers, manifests, product relations and byte hashes were verified. | **PASS** | Added a local-only rehearsal script. | It does not prove production RPO/RTO or backup scheduling. |
| Catalog rollback | Release Owner | Coordinated R1 DB/reference/private snapshot restore returned the pointer and all hashes to R1 after R2 had been published. | **PASS** | No pointer-mutation shortcut was introduced. | Operational approval, outage budget and production runbook execution remain untested. |
| Previous client compatibility | Client Release Owner | Gate 4 client commit `64bc99b` built against the restored R2 backend; live desktop and mobile-emulation journeys read the R2 product and protected image: 2/2 passed. | **PASS** | Added a prerequisite-gated live compatibility test. | Physical devices and older deployed builds outside the tested commit are not covered. |
| Large-family Download/Sync contention | SRE + Backend Owner | Three local A/B probes used real PostgreSQL, authorization, Sync acceptance and reference-media reads, but only a small synthetic family and repeated assets. | **BLOCKED** | No speculative product change. Existing client still limits bulk to two and starts no new bulk transfer while Sync is active. | Representative family bytes, concurrent stores, proxy bandwidth and production thresholds are absent. |
| Integrated disruptive offline journeys | Client QA | Hosted PWA/offline cases passed, but exact process-kill, quota exhaustion, live revocation and live Store/account switch during a large download were unavailable. | **BLOCKED** | Operator scripts/checklists are defined below. | Storage corruption, eviction and scope-transition behavior need device evidence. |
| Physical mobile matrix | Field QA | No connected physical device or measurement tooling was available. | **BLOCKED** | Executable matrix and evidence form added below. | Performance, memory, eviction and iOS PWA behavior remain unknown. |
| Image publication rights | Legal / Catalog Operations / Release Owner | Code records source and requires a confirmation, but no real rights dossier or approver evidence was supplied. | **BLOCKED** | Operational approval contract defined below. | Publishing any unapproved image is prohibited. |
| Monitoring, alerting and operational ownership | SRE / Support / Incident Commander | No dashboards, alert routes, thresholds, on-call roster or named operational owner were accessible. | **BLOCKED** | Required signals and ownership are listed below. | Incidents could be invisible or unowned. |
| Feature defaults | Backend + Release Owner | `CATALOG_ON_DEMAND_ADOPTION_ENABLED`, `CATALOG_CURSOR_READ_V2_ENABLED`, `CATALOG_REFERENCE_MEDIA_V1_ENABLED` and `CATALOG_OFFLINE_FAMILIES_V1_ENABLED` default to false. | **PASS** | No change. | Activation still requires a separate authorized rollout. |

## 2. Deployment and operational infrastructure audit

The accessible repository is not a description of production. Its Compose file
publishes PostgreSQL only on host loopback and mounts one local Docker volume. It
does not define the API, web client, reverse proxy, TLS, private-media volume,
reference-media volume, backup job, metrics collector or alert manager. Local free
space observed on drive D was about 98.7 GB; this says nothing about a production
host.

Production cannot be approved until Platform Operations supplies and signs an
evidence packet containing:

1. an exact topology and service-identity map, including failure domains;
2. durable mount identifiers for PostgreSQL, private media and reference media,
   with owner, mode, capacity, IOPS and restart/replacement tests;
3. proxy and TLS configuration plus observed response headers for HTML, manifests
   and authenticated assets;
4. resource requests/limits, database pool limits and measured headroom;
5. backup schedule, encryption, retention, off-site policy, RPO/RTO, restore owner
   and a dated restore record;
6. dashboards and alerts for API 4xx/5xx, Sync latency/error/outbox depth, manifest
   and asset latency/bytes/concurrency, storage usage, publication failures,
   pointer mismatch and client download failures; and
7. a named release owner, incident commander, SRE/on-call owner and support owner.

Absent evidence remains `BLOCKED`; repository defaults are not substituted for
deployed state.

## 3. Full Catalog recovery rehearsal

The rehearsal used isolated database `tanzim_gate6_test`, production-mode backend
configuration and explicit disposable media roots. The synthetic Catalog contained
one industry, one family, one related product and approved Preview/Detail relations.

| Evidence | Release 1 | Release 2 |
|---|---|---|
| Release ID | `56a76b70-4cc2-4d89-b797-947b2e797453` | `241ef13d-5d31-4134-a56c-81fc4797c405` |
| Version / predecessor | 1 / none | 2 / Release 1 |
| Pointer manifest SHA-256 | `61eb8e71917360ca323c6565928c8e4d1d58582e778aeaf4f4c536b6ee6e9627` | `f790c2c18e84348cf21b7efaa7dbb1fd24d276cf810500dfeaae35f2164c2fcd` |
| Family content SHA-256 | `e02e530a2336e981bf5a9dee5d028898156eadd6f2e61597d0f669b4e029333e` | `4376326823f4f3572e448fe723d53cec47ccf05c6123826379e1ce041cd45532` |
| Preview/Detail content SHA-256 | `2e2ce28adc9e8b8da5a99c90da3e4d4aa9963e211302f87b15b48a54b7650087` | `ced8a63e154011c4882d56fd56b826a85ea3c68c2394778c47d14f827c14d00f` |
| PostgreSQL dump | 194,121 bytes; `baa45205cfb34720e3386537c3c11d31648ff3417950d53ff114e6630fa7498b` | 194,735 bytes; `38a55ecdc2e8b5ddb5f921e62ffa4a5a26c8f42463b7e6bec028578bf00a831c` |
| Media snapshot | 3 reference files / 3,186 bytes; empty private set | 6 reference files / 6,820 bytes; empty private set |

R2 was restored into `tanzim_gate6_restore_r2` with separate restored media roots.
Alembic was `20261118_0021`; the current pointer, exact family manifest, product
relation, Preview and Detail requests and their downloaded SHA-256 values all
matched R2. R1 was then restored into `tanzim_gate6_rollback_r1` with a separate R1
media tree; the same checks matched R1 and proved a non-empty pointer rollback.
The empty private-media set was preserved as an empty set; Gate 5 separately proved
non-empty private-media recovery. No authority, membership, credential or
subscription was restored through the application backup boundary.

The rehearsal tool refuses non-local HTTP API hosts and requires the administrator
credential through an environment variable. It does not store access tokens.

## 4. Real local Download/Sync contention probe

Each phase created an isolated customer Store, assigned an authorized subscription,
selected an industry and submitted 30 unique Inventory `CREATE` operations through
real `/sync/batch`. The contention phase concurrently issued 500 authenticated,
release/family-scoped asset reads. All Sync results were `applied`; all media reads
returned successfully.

| Run | Media workers | Baseline Sync p50 / p95 | Contended Sync p50 / p95 | p95 change | Media bytes / requests / errors |
|---|---:|---:|---:|---:|---:|
| 1 | 2 | 91.55 / 140.50 ms | 100.77 / 123.60 ms | -12.0% | 1,017,000 / 500 / 0 |
| 2 | 2 | 89.55 / 103.51 ms | 103.31 / 122.10 ms | +18.0% | 1,017,000 / 500 / 0 |
| 3 | 4 | 87.41 / 106.24 ms | 127.38 / 144.05 ms | +35.6% | 1,017,000 / 500 / 0 |

For the second two-worker run, backend CPU increased by about 1.88 CPU-seconds
during the baseline and 11.02 CPU-seconds during the longer contention phase.
Working set was about 88.7 MiB after baseline and 92.1 MiB after contention; the
process peak reported by Windows was about 94.1 MiB. Contention duration was 11.10 s
and media p95 was 96.97 ms. The first two-worker p95 moved in the opposite direction,
showing that this small local sample is variable and must not define a release SLO.

This is a request-contention probe, not a representative large-family result. The
release has one product and two small deduplicated assets; repeated reads are more
request-heavy and less bandwidth-heavy than the real client. The real loader has a
four-total/two-bulk ceiling and starts no new bulk request while Sync reports
`syncing`. The repeatable p95 increase is a reason to require production-like
capacity evidence, not enough evidence for an architectural or threshold change.
No speculative fix was made.

## 5. Integrated offline/failure scenario matrix

| Required scenario | Executed evidence | Status |
|---|---|---|
| Download family and start offline from installed PWA | Hosted production build completed verified download, acquired a service-worker controller, reloaded offline and rendered IndexedDB metadata plus OPFS image in both browser projects. | **PASS** for browser automation; not physical field evidence |
| Add downloaded Catalog product offline and Sync after reconnect | Offline Inventory CRUD/outbox and online Catalog adoption/Sync are separately covered; one uninterrupted live Catalog-download-to-offline-adoption-to-reconnect journey was not executed. | **BLOCKED** |
| Publish R2 and incremental client update | Real R2 publication, predecessor link, restore and previous-client read passed. Local hash reuse and atomic activation are unit-tested, but the exact live client incremental-download journey was not run. | **BLOCKED** |
| Stop application during OPFS and IndexedDB writes | Temporary-file reconciliation, tab close during staging, restart persistence and failed activation are covered. Exact OS process termination at both commit boundaries was unavailable. | **BLOCKED** |
| Change Store and account during download | Scope partitions and access-change cancellation are implemented and unit-covered; no live multi-Store/account switch during a large transfer was run. | **BLOCKED** |
| Revoke access and inspect cache behavior | Server authorization denies unentitled asset reads and offline authorization has a bounded lease. Live revocation plus cache observation through that lease was unavailable. | **BLOCKED** |
| Fill storage | Preflight quota refusal and atomic activation contracts exist, but no real browser profile was driven to quota exhaustion. | **BLOCKED** |
| Preserve last healthy offline version after failed update | Automated manifest/hash failure coverage preserves the active release. A hosted family download/offline reload passed, but exact real process/quota failure during R2 replacement was unavailable. | **BLOCKED** for the requested disruptive E2E |

No blocked scenario is described as passed merely because a lower-level unit test
exists.

## 6. Physical mobile execution matrix

| Target | Minimum profile | Required modes | Status |
|---|---|---|---|
| Economic Android | 3-4 GB RAM, current supported Chrome, at least one constrained-storage run | Browser and installed PWA; Wi-Fi and constrained cellular | **BLOCKED - device unavailable** |
| Midrange Android | 6-8 GB RAM, current supported Chrome | Browser and installed PWA; Wi-Fi and constrained cellular | **BLOCKED - device unavailable** |
| iPhone | A currently supported iOS/Safari version | Safari and Home Screen web app; Wi-Fi and cellular | **BLOCKED - device unavailable** |

### Operator checklist

For each row, the operator must use the exact candidate build and release ID and:

1. record model, OS, browser/WebKit version, RAM if observable, total/free storage,
   power mode, network and PWA installation state;
2. clear only the dedicated test profile, sign in, select the authorized Store and
   confirm all four rollout flags/cohort identifiers;
3. measure cold/warm Catalog open, search (20 samples), first/warm image, complete
   family time, requests, transferred bytes, CPU/memory where tooling permits and
   storage before/after;
4. repeat download pause/resume and network loss/recovery;
5. kill the app separately during IndexedDB staging and OPFS temporary/final rename,
   reopen offline, and prove the prior active release remains usable;
6. perform offline Catalog adoption, reconnect, and prove exactly one server record
   and a resolved outbox operation;
7. publish the next authorized release, measure incremental bytes and verify reused
   hashes are not transferred again;
8. switch Store, switch account, log out and revoke access during an active download;
   verify no other scope's metadata or bytes are displayed;
9. drive storage below the manifest preflight need and then to an actual write
   failure; verify explicit recovery and the last healthy release; and
10. remove the downloaded family and verify only unpinned, unreferenced content is
    reclaimed.

### Result form

| Field | Operator entry |
|---|---|
| Operator / date / location | |
| Device / OS / browser / PWA mode | |
| Build / schema / release / family / Store / test account | |
| Network / free storage before and after | |
| Cold and warm timings; search p50/p95 | |
| Download duration / requests / bytes / errors | |
| Sync duration / errors / outbox before-after | |
| CPU / peak RAM / battery or thermal observations | |
| Kill-point and recovered active release | |
| Scope switch / revocation / quota outcome | |
| Screenshots, screen recording, logs and trace links | |
| PASS / FAIL and defect ID | |
| Operator and QA signatures | |

Any cross-Store/account visibility, lost or retrying rejected payload, corrupted
active release, hash mismatch, unrecoverable quota failure or unauthorized cached
display is an immediate `FAIL` and release stop.

## 7. Image-rights publication contract

An image may move through `DRAFT -> SUBMITTED -> RIGHTS_APPROVED ->
RELEASE_APPROVED -> PUBLISHED`. `REJECTED`, `EXPIRED` and `REVOKED` are terminal for
new publication. Revocation requires an emergency unpublish/next-release procedure;
it must not rewrite an immutable historical release without a separately approved
legal retention action.

| Role | Mandatory responsibility | Separation rule |
|---|---|---|
| Catalog Submitter | Record original URL/file, creator/rightsholder, acquisition time, license text/ID, territory, term, permitted transformations, attribution, restrictions and evidence files/hashes. | Cannot approve own submission. |
| Rights Reviewer (Legal/IP) | Validate ownership/license chain, scope, expiry, attribution and evidence authenticity; approve, reject or request correction with identity and timestamp. | Must be independent of Submitter. |
| Catalog Content Owner | Confirm image-to-product accuracy, variants/crops and required attribution presentation. | Cannot override a Rights rejection. |
| Release Owner | Confirm every release asset is `RIGHTS_APPROVED`, unexpired and included in the signed release evidence; grant final `RELEASE_APPROVED`. | Must not infer approval from `rights_confirmed=true`. |
| Platform Operator | Publish only the approved immutable release/request ID; preserve logs and stop on any missing/expired approval. | Has no authority to create legal approval. |
| Audit/Records Owner | Retain source evidence, decisions, release membership and revocation history for the approved policy period. | Records are append-only/auditable. |

The dossier must include asset SHA-256, source locator, captured source evidence,
rightsholder, license/grant document and hash, permitted products/territory/channel,
start/end dates, attribution, transformation/AI restrictions, reviewer identity,
decision timestamp, release-owner identity and the release IDs that used it. A
boolean confirmation without this evidence is not approval. No image in this Gate
is declared legally approved; synthetic repository test assets were used only in
the isolated development rehearsal.

## 8. Monitoring and release-stop requirements

Before a pilot, named owners must install and test alerts for:

- API and Sync request rate, p50/p95/p99 latency, error codes and outbox depth;
- manifest/asset latency, bytes, concurrency, authorization denials and hash errors;
- publication duration/failure, current-pointer mismatch and missing media;
- PostgreSQL saturation, locks, pool use, disk, replica/backup age and restore job;
- private/reference volume capacity, inode/file growth and read errors; and
- client download state/error, storage-quota refusal, active/pending release and
  build/flag cohorts.

Thresholds must be derived from a representative pilot baseline and service
objectives; none are invented here. Cross-tenant access, pointer/hash mismatch,
loss of the last healthy release, outbox loss, sustained Sync degradation,
unexplained storage growth, rights violation, missing backup or unowned critical
alert is a stop condition.

## 9. Verification evidence

| Command / journey | Result |
|---|---|
| `npm.cmd run test:regression` constituents | 94 files / 425 frontend tests passed; test typecheck passed; 113 backend tests passed; production build passed; final lint passed. An initial lint attempt was invalidated by the nested temporary previous-client worktree; removing that evidence worktree eliminated the second `tsconfigRootDir`, after which lint passed without changing a rule or test. |
| `npm.cmd run test:backend:postgres:local` | **26/26 passed** in 71.49 s against disposable PostgreSQL. |
| Hosted `playwright test` on current production build | **144 passed, 10 prerequisite skips, 0 failed** in 3.8 min across desktop and Pixel 7 emulation. Eight prior live prerequisites plus the two-project previous-client test were intentionally skipped in this baseline run. |
| Gate 4 client build at `64bc99b` | Production build passed. |
| Previous-client live Catalog test | **2/2 passed** against restored R2 on desktop and mobile emulation; product and authenticated Blob image rendered. |
| R1/R2 publish/verify, R2 restore, R1 rollback | **PASS** with exact IDs and hashes in section 3. |
| Local contention probe | Three A/B runs completed with zero Sync/media errors; limited representativeness is documented in section 4. |
| Rehearsal script syntax | Python byte-compilation passed. |

The first previous-client authentication attempt failed because the test preview
origin was not in the isolated backend CORS list. Server logs showed HTTP 400 for
the preflight. Adding only the explicit local preview origin made the same desktop
and mobile authentication test pass 2/2. A later direct hard navigation was also
corrected to the real SPA-link path because a new document intentionally begins in
online-entitlement verification state. Neither diagnostic required a production
code change or weakened assertion.

## 10. Changes made and residual release risk

Gate 6 added only validation artifacts:

- `scripts/catalog-release-recovery-rehearsal.py`: local-only publication,
  verification, recovery and contention probe;
- `tests/e2e/catalog-previous-client-real.spec.ts`: prerequisite-gated live
  compatibility journey; and
- this closure report and the Catalog rollout changelog entry.

No runtime, schema, authorization, cache, Sync or feature-flag behavior changed.
The unresolved blockers are external evidence and operations work, not hidden
passes. Production remains **NO-GO**.

**Stop rule observed:** Gate 6 ends here. Pilot start, merge, push, deployment,
production migration, publication or flag activation requires a separate explicit
instruction.
