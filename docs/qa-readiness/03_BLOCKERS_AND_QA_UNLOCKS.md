# Gate 7-PREP — Blockers and QA unlocks

| Finding | Root cause | Decision | Evidence / completion condition |
|---|---|---|---|
| “ثبت حوزه‌های جدید…” warning | `TAXONOMY_ADOPTION_ENABLED` defaults false until label readability/print validation | QA-only enable for new empty store; production default unchanged | taxonomy lifecycle and PostgreSQL concurrency/rollback tests |
| Change industry on a used store | Adoption contract refuses any inventory/invoice/movement/barcode/operation history | BLOCKED; do not bypass `LEGACY_STORE_REVIEW_REQUIRED` | requires an approved migration/reclassification product contract, not a QA switch |
| Automotive recategorization | must retire internal labels atomically and preserve historical invoice/barcode links | PASS software through preview/confirm/idempotency/rollback tests | physical scan of replacement and retired labels remains BLOCKED |
| Physical barcode readability | browser encoder/decoder cannot prove camera, stock, scale or printer behavior | BLOCKED | run the device/printer checklist in `TZ-013-barcodes-scanning-labels.md` |
| Reference image publication rights | QA synthetic images are not release licenses | BLOCKED for production publication | documented owner, source, license and final approval evidence |
| Real mobile storage/OPFS limits | emulator/browser automation is not a physical low-end device | BLOCKED | operator matrix from Gate 6 plus reload/offline/download checks |
| Shared staging/production seed | cannot prove isolation | DENIED fail-closed | dedicated local QA/test database and distinct media roots required |

## Unmerged historical branches

No historical branch was merged into this Gate. `chore/v1-baseline` is patch-equivalent to content already in `draft`. `backend` and `feature/vendor-needs-survey` are unrelated divergent histories. `develop` contains an artifact-heavy commit plus two sync changes that conflict with current invariants (implicit fallback industry and retry of terminal failures); therefore a whole-branch merge is unsafe. Its periodic-sync change also predates the current entitlement verification path and requires separate redesign/testing.
