# GATE 0 — Current baseline status

**Status: NO-GO**

**Captured:** 2026-11-17, Asia/Tehran

**Branch:** `feat/catalog-safe-rollout`

**Baseline commit:** `9e521a64807191b4a82475ae6a13b1a8e1f77189`

Gate 0 originally found a green unit/backend/build baseline but nine hosted E2E
failures and missing recovery/scale/deployment evidence. Gate 0-R reproduced and
classified every original failure, corrected deterministic test defects, ran a
fresh paired PostgreSQL/media recovery rehearsal, and captured synthetic scale
measurements.

Current verification summary:

- regression: PASS (414 frontend tests, 104 backend tests, typecheck, build, lint);
- PostgreSQL integration: PASS (22 tests);
- corrected focused E2E regressions: PASS;
- final standard hosted E2E: FAIL (126 passed, 2 browser-process closures,
  8 skipped);
- paired synthetic database/media restore: PASS;
- 1k/5k/10k/50k Catalog benchmark: captured;
- production topology, access/publication policy and target devices: NOT VERIFIED.

The detailed evidence, commands, failure matrix, restore hashes, benchmark table,
and remaining blockers are in [00R_BASELINE_RECOVERY.md](00R_BASELINE_RECOVERY.md).

No Catalog runtime behavior, schema, Sync/outbox/OPFS contract, dependency, or
production resource changed in Gate 0 or Gate 0-R.

**Explicit gate status: NO-GO. Do not begin GATE 1 behavior changes.**
