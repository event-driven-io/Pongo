# Immutable Database Component Growth Progress

## Dumbo phase

- [x] Re-read `imm_plan.md` and the current Dumbo component factories.
- [x] Identify migration ownership, extension placement, and typing constraints.
- [x] Add usage-named runtime tests for `schema.withTable(...)`.
- [x] Add usage-named runtime tests for `database.withSchema(...)`.
- [x] Add usage-named runtime tests for default and named `database.withTable(...)`.
- [x] Add compile-time inference tests for all new Dumbo APIs.
- [x] Run the new tests before implementation and record the expected failures.
- [x] Implement the Dumbo APIs in the existing component factories.
- [x] Run focused Dumbo runtime and type checks.
- [x] Run the full Dumbo unit suite.
- [x] Review the Dumbo diff for redundant abstractions and dead code.
- [x] Stop for approval before changing Pongo.

## Dumbo upsert correction

- [x] Update `imm_plan.md` to make `withSchema` an unconditional direct-schema upsert.
- [x] Remove extension-specific behavior from the planned `withTable` algorithm.
- [x] Keep runtime tests focused on direct schema add, replace, and table usage.
- [x] Run the corrected tests before implementation and record the failures.
- [x] Remove `generateCreateSchema`, extension lookup, and traversal reordering.
- [x] Implement named `withTable` as lookup/create, schema `withTable`, then `withSchema`.
- [x] Remove tests coupled to the discarded ownership flag and extension branch.
- [x] Name API suites by their usage signatures rather than fixture aliases.
- [x] Run focused, full Dumbo, formatting, and global type verification.

## Later phases

- [x] Replace Pongo's schema overlay with the evolving immutable database component.
- [x] Update `spec.md`, `ref_plan.md`, and `todo.md`.
- [x] Run repository-wide verification.

## Pongo evolving component

- [x] Re-read the overlay, schema accessor, projection, and migration code paths.
- [x] Rewrite overlay-oriented assertions around `db.collection(...)` usage.
- [x] Add usage coverage for component identity, accumulation, and dynamic projection.
- [x] Add usage coverage for direct schemas beside extension-contributed schemas.
- [x] Run the focused Pongo database tests red before implementation changes.
- [x] Replace the overlay with one evolving immutable database component.
- [x] Remove overlay scopes and Pongo-specific migration aggregation.
- [x] Update schema accessor typing and remove dead imports/code.
- [x] Run focused Pongo runtime and type tests.

## Migration traversal regression

- [x] Trace the failed PostgreSQL and SQLite index-migration integration tests.
- [x] Confirm the implementation conflicts with the documented own-then-children traversal.
- [x] Add a unit regression test matching a custom table migration with a declared custom index.
- [x] Run the new unit test red before implementation changes.
- [x] Restore generated/custom own migrations followed by child traversal.
- [x] Run focused unit and affected integration tests.

## Evidence

- No implementation files changed before the Dumbo tests were added.
- Red runtime run: 12 new tests failed because `withTable`/`withSchema` did not exist; 17 existing tests passed.
- Red type run: `tsc -b packages/dumbo` failed at the new method usages because the APIs did not exist.
- Focused green runtime run: 29 tests passed across the two component suites.
- Green type run: `tsc -b packages/dumbo` passed, including the new inference tests.
- Full Dumbo unit run: 761 tests passed across 45 files.
- Global `npm run fix` completed from `src`.
- Global `npm run build:ts` completed successfully from `src`.
- Diff review: no parallel component tree, node/instance wrapper, alternate traversal, unused helper, or replaced Dumbo code path was introduced.
- Correction red run established the obsolete extension-specific implementation before it was removed; implementation-specific regression assertions were subsequently dropped from the final usage-focused suite.
- Correction green runtime run: 29 focused tests passed.
- Final usage-focused Dumbo unit run: 760 tests passed across 45 files.
- Corrected global `npm run fix` and `npm run build:ts` both passed from `src`.
- Correction review: extensions are no longer inspected by `withTable`; no schema ownership flag or special traversal branch remains.
- Migration regression red run: the new unit test returned only the schema and custom table migrations; both declared index migrations were absent.
- Migration regression green run: 96 focused component tests passed.
- Affected integration run: PostgreSQL and both SQLite index-migration scenarios passed.
- Full Dumbo unit run after the regression fix: 761 tests passed across 45 files.
- Global `npm run fix` and `npm run build:ts` passed from `src` after the regression fix.
- Pongo red run: 8 usage tests failed because dynamic collections remained outside `db.schema.component`; 15 existing tests passed.
- Pongo focused green run: 32 runtime and schema typing tests passed.
- Dead-code review: no Pongo overlay helper/maps, schema discovery import, or migration dedupe dependency remains.
- Full Pongo unit run: 344 tests passed across 16 files.
- Documentation now describes immutable component growth and the single current Pongo component.
- Final global `npm run fix` and `npm run build:ts` passed from `src`.
- Full repository run passed: 1,105 unit tests, 391 integration tests, and 465 end-to-end tests; 5 end-to-end tests were skipped.
- Final naming cleanup distinguishes cached public schema handles from deleted declaration scopes; focused Pongo runtime/type tests remained green at 32 tests.
