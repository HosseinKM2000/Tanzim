# Catalog safe rollout changelog

## GATE 0 — 2026-11-17

### Files changed

- `docs/catalog-rollout/00_BASELINE.md`
- `docs/catalog-rollout/CHANGELOG.md`

### Runtime, schema and compatibility

- Runtime code changed: no.
- PostgreSQL migration added or executed: no.
- Dexie schema changed: no.
- Sync/outbox/media behavior changed: no.
- OPFS files changed or deleted: no.
- Dependencies installed or updated: no.
- Production/staging deployment changed: no.
- Feature flag added: no; existing default-off environment-gate pattern was documented.

### Verification summary

- `npm.cmd run test:regression`: PASS (414 frontend tests, 104 backend tests, typecheck, build and lint).
- `npm.cmd run test:backend:postgres:local`: PASS (22 tests).
- Direct unhosted E2E: invalid environment baseline, 128 connection-refused failures and 8 skips.
- Hosted production-preview E2E: FAIL (119 passed, 9 failed, 8 skipped).
- Gate decision: **NO-GO**; no later Gate started.

See `00_BASELINE.md` for commands, failure classification, database aggregate snapshot, backup/restore checklist, residual risks and prerequisites for a future GO decision.

## GATE 0-R — 2026-11-17

### Recovery work

- Reproduced and classified all nine original hosted E2E failures.
- Corrected deterministic selectors, stale time fixtures, queue-policy assertion,
  entitlement-verification race, and explicit invoice-mode selection in tests.
- Changed no Catalog runtime, schema, Sync, outbox, OPFS, dependency, or deployment behavior.
- Ran an isolated paired PostgreSQL/media dump and restore rehearsal successfully.
- Captured local synthetic Catalog baselines at 1k, 5k, 10k and 50k rows.
- Removed all synthetic rehearsal databases and temporary media/dump artifacts.

### Verification summary

- `npm.cmd run test:regression`: PASS (414 frontend, 104 backend, typecheck, build, lint).
- `npm.cmd run test:backend:postgres:local`: PASS (22 tests).
- Focused corrected E2E scenarios: PASS, including 8/8 repeated parallel counterparties runs.
- Final standard hosted E2E: FAIL (126 passed, 2 browser-process closures, 8 skipped).
- Gate decision: **NO-GO**; Gate 1 was not started.

See `00R_BASELINE_RECOVERY.md` for the complete evidence and blockers.

## GATE 0-S — 2026-11-17

### Stabilization work

- Set the evidence-backed Playwright development default to two workers while
  retaining an explicit positive-integer `E2E_WORKERS` override.
- Fixed entitlement external-store revision consumption and removed a redundant
  online transition that could reopen the verification gate.
- Made gated navigation, counterparty, invoice and scanner behavior consume the
  live verified access snapshot.
- Stabilized invoice history persistence/type selection and the theme preset
  measurement without adding retries, timeouts or skips.
- Added unit/component regression coverage for sync verification and entitlement
  re-rendering.

### Verification summary

- `npm.cmd run test:regression`: PASS (416 frontend, 104 backend, test
  typecheck, production build, lint).
- `npm.cmd run test:backend:postgres:local`: PASS (22 tests).
- Final hosted E2E: PASS (128 passed, 8 documented external-prerequisite skips,
  0 failed); at least three complete successful runs were recorded.
- Development Gate: **GO — DEVELOPMENT ONLY**.
- Production Release Gate: **NO-GO / NOT ASSESSED**; Gate 1 was not started.

See `00S_E2E_STABILIZATION.md` for worker pressure evidence, root-cause analysis,
full run history, skip prerequisites and remaining production blockers.
