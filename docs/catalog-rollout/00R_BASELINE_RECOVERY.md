# GATE 0-R — Baseline recovery and verification

**Status: NO-GO**

**Captured:** 2026-11-17, Asia/Tehran

**Branch:** `feat/catalog-safe-rollout`

**Baseline:** `9e521a64807191b4a82475ae6a13b1a8e1f77189`

Gate 0-R repaired deterministic baseline-test defects, reproduced the remaining
failures, ran an isolated database/media recovery rehearsal, and measured the
current Catalog implementation at 1k/5k/10k/50k rows. It did not add Catalog
behavior, change schemas, change Sync/outbox/OPFS behavior, or touch production.

## Decision

Gate 0-R remains **NO-GO**. The deterministic failures are repaired and all
focused regressions pass, but the standard eight-worker hosted E2E target still
has two browser-process closures before test execution. Production media/proxy/
capacity evidence, target-device evidence, and reference-image publication
policy are also unavailable. Unknown evidence is recorded as `NOT VERIFIED`,
not inferred as safe. Gate 1 must not start.

## Failure reproduction and classification

The original hosted run had 119 passed, 9 failed, and 8 skipped. Each failure
was rerun in isolation against `vite preview` on `127.0.0.1:4173`.

| Original failures | Reproduction | Root cause | Disposition |
|---|---|---|---|
| Dashboard scroll restoration, desktop + mobile | deterministic | Test selected only the mobile nav, then reused it after switching to desktop width | Select the visible desktop sidebar or bottom navigation |
| Invoice dashboard coverage, desktop + mobile | deterministic | Fixture timestamp `2026-11-04` aged outside the real seven-day window | Use the test-run timestamp |
| PWA offline cold-page DELETE, mobile | deterministic | Assertion contradicted the documented queue rule: offline CREATE followed by DELETE is consolidated to no operation | Assert absent product and no queued operation |
| PWA cold page, desktop | isolated scenario reached the same queue assertion; no browser crash | Same assertion defect | Covered by corrected assertion |
| Invoice editor, desktop | 3/3 isolated pass | Parallel browser-process closure | Product behavior not implicated |
| Entitlement management, mobile | 3/3 isolated pass | Parallel browser-process closure | Product behavior not implicated |
| Navigation/sidebar, mobile | 3/3 isolated pass | Parallel browser-process closure | Product behavior not implicated |

Additional full-suite pressure runs exposed two test races:

- Counterparties could render while entitlement verification was still pending.
  The fixture now uses the current timestamp, waits for `/api/plans/current`, and
  reloads from the verified cache. Result: 8/8 parallel repeated passes.
- The invoice flow relied on an entitlement-timing-dependent default mode and
  used a non-exact heading locator. It now selects Sale explicitly and uses an
  exact heading locator.

No timeout was increased. A `--disable-gpu` experiment did not eliminate the
failures and was reverted. No runtime workaround was retained.

## Files changed

- `tests/e2e/dashboard.spec.ts`
- `tests/e2e/invoices.spec.ts`
- `tests/e2e/pwa.spec.ts`
- `tests/e2e/counterparties.spec.ts`
- `docs/catalog-rollout/00_BASELINE.md`
- `docs/catalog-rollout/00R_BASELINE_RECOVERY.md`
- `docs/catalog-rollout/CHANGELOG.md`

## Verification evidence

| Command / scope | Result |
|---|---|
| `npm.cmd run test:regression` | PASS: 90 Vitest files / 414 tests; typecheck; 104 backend tests; build; lint |
| `npm.cmd run test:backend:postgres:local` | PASS: 22 tests |
| Three original deterministic fixes, both projects, repeat 2, worker 1 | PASS: 12/12 |
| Original context-close cases in isolation, repeated | PASS |
| Counterparty recovery, both projects, repeat 4, workers 4 | PASS: 8/8 |
| Final standard hosted `npm.cmd run test:e2e`, 8 workers | FAIL: 126 passed, 2 browser-process closures, 8 skipped |
| Final two browser-close identities, mobile, repeat 3, worker 1 | PASS: 6/6 |

The two final failures were the mobile invoice layout and local-backup layout
tests. Both failed in `browser.newContext` with `Target page, context or browser
has been closed`, before their assertions ran. The failing identities vary
between full runs: earlier post-fix runs produced 125/3, 124/4, and 119/9 at
different worker counts, while the corresponding isolated scenarios pass.
This is host/browser-runner instability, but it is still an unresolved required
test-target failure and therefore blocks GO.

The eight skips are integration scenarios requiring external/live prerequisites;
they were not silently converted to passes.

## Isolated PostgreSQL and media recovery rehearsal

The rehearsal used only three disposable local databases:
`tanzim_gate0r_source`, `tanzim_gate0r_restore`, and later the separate
`tanzim_gate0r_benchmark`. No development/customer database was mutated.

1. Migrated the source database to Alembic `20261116_0019`.
2. Added one synthetic shared Catalog row whose image path referenced one
   synthetic media copy.
3. Created a custom-format dump with PostgreSQL 18.6 `pg_dump`.
4. Restored it with `pg_restore --exit-on-error` into a new database.
5. Restored media into a separate root and compared SHA-256.
6. Queried the restored schema and Catalog row.

| Check | Result |
|---|---|
| Dump size | 170,101 bytes |
| Dump SHA-256 | `184EF1CAACB993E5E7C0D49FF94EB3239363AFB7397F7B67EFE55E007FBF8906` |
| Restored Alembic revision | `20261116_0019` |
| Restored aggregate | 25 industries, 1 synthetic Catalog product |
| Catalog media path | `/media/gate0r/catalog-icon.png` preserved |
| Media SHA-256 | `E63566D30AC74586DE6DEA0A52C1D5585F9E6B639465877CF617CC5BFB0DCF20` on both roots |

After verification, the exact three rehearsal databases, container dump, and
workspace rehearsal directory were removed. They contained synthetic evidence
only and are not recoverable, but the documented procedure is reproducible.

## Synthetic Catalog benchmark

The benchmark ran in the isolated `tanzim_gate0r_benchmark` PostgreSQL database
at Alembic head. Each size used five repository-query samples, three Pydantic
serialization samples, and five search samples. These are local-machine
baselines, not production SLOs.

| Rows | Full query P50 / P95 | Serialize P50 / P95 | JSON bytes | Search P50 / P95 | SQL statements |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 13.89 / 67.03 ms | 2.41 / 2.62 ms | 312,180 | 4.03 / 13.51 ms | 1 |
| 5,000 | 61.29 / 63.63 ms | 12.04 / 12.12 ms | 1,574,180 | 11.17 / 12.74 ms | 1 |
| 10,000 | 128.36 / 132.97 ms | 37.05 / 37.76 ms | 3,151,683 | 21.41 / 21.67 ms | 1 |
| 50,000 | 1,148.86 / 1,320.91 ms | 133.74 / 139.03 ms | 15,891,683 | 79.20 / 84.69 ms | 1 |

The query does not have an N+1 problem in this path, but it is unbounded. Code
inspection confirms the UI maps every returned row to one card and emits one
`<img>` for every row with an image. Thus the current 50k case projects 50k DOM
cards and up to 50k image requests. Browser memory, long-task, warm-cache, and
target-device measurements are `NOT VERIFIED`; the existing unbounded design
is not a safe target-device assumption.

## Deployment and access evidence

| Requirement | Status |
|---|---|
| Application requires explicit durable `MEDIA_STORAGE_DIR` in production | VERIFIED in code |
| Durable application media volume in repository deployment | NOT VERIFIED; compose declares PostgreSQL only |
| Reverse proxy/static media offload | NOT VERIFIED |
| TLS, HTTP/2 or HTTP/3, compression and cache headers | NOT VERIFIED |
| Production disk, bandwidth, ownership, monitoring, retention and RPO/RTO | NOT VERIFIED |
| Reference-image acquisition/publication rights | NOT DECIDED |
| Target iOS/Android device behavior | NOT VERIFIED |

## Remaining blockers and next safe action

1. Stabilize the standard parallel Playwright target so a complete hosted run
   finishes without browser-process closure, then rerun it unchanged.
2. Supply and verify deployment topology, durable media ownership, monitoring,
   capacity, retention, and rollback operators.
3. Decide and document reference-image licensing/publication policy.
4. Define pagination/virtualization and image-delivery budgets using the scale
   evidence before exposing large Catalog families.
5. Run real target-device and constrained-network measurements.

**Explicit result: NO-GO. Gate 1 was not started.**
