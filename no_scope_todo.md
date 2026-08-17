# No-Scope Implementation Todo

## 1. Baseline and test design

- [x] Review `no_scope_plan.md` and current component/projection/scope code.
- [x] Adjust Pongo schema runtime and type tests for XOR declarations composed through `withSchema`/`withTable`.
- [x] Adjust Pongo database tests for projected default/named collection access and stable identity.
- [x] Adjust schema-management tests to use the plain `db.schema` object and explicit `db.collection` schema options.
- [x] Adjust client tests for declared database access through the public client API.
- [x] Adjust Dumbo migration tests for local custom-migration ownership and child traversal.
- [x] Run the changed tests before implementation and record the expected failures.
- [x] Align runtime usage tests with lazy component-backed proxy access and remove descriptor-level freeze expectations.
- [x] Remove stale collection-placement metadata assertions and projector-specific error wording.

## 2. Dumbo component behavior

- [x] Implement local migration ownership (`custom ?? generated`) while always traversing children.
- [x] Verify `withTable` and `withSchema` preserve component migration behavior.
- [x] Run focused Dumbo component and migration tests. (78 unit and 52 integration tests passed)

## 3. Unified Pongo declarations and types

- [x] Restore XOR `pongoSchema.db({ collections })` / `pongoSchema.db({ schemas })` inputs while retaining composed database components.
- [x] Store default collections directly as Dumbo database tables and named schemas directly as Dumbo schemas.
- [x] Remove collection-level `databaseSchemaName` placement metadata.
- [x] Remove copied Pongo collection records and mode-specific database component types.
- [x] Derive projected default collections and named schemas directly from Dumbo component fields.
- [x] Update declaration call sites to express placement through parent schemas.
- [x] Run focused Pongo schema runtime and type tests. (204 focused Pongo tests passed)

## 4. Pongo runtime simplification

- [x] Replace `projectPongoDb` and accessor installation with one canonical database proxy backed directly by the initial Dumbo component.
- [x] Preserve stable projected collection and named-schema object identity.
- [x] Add explicit collision validation for projected database properties.
- [x] Replace `PongoSchemaScope` and callable schema access with a plain schema property.
- [x] Name the existing database and collection schema property contracts without adding runtime component wrappers.
- [x] Keep dynamic registration as Dumbo `findTable` plus `component.withTable`.
- [x] Keep only live collection caches as Pongo collection state.
- [x] Return a client proxy backed directly by `clientSchema.dbs` and the existing database cache.
- [x] Remove descriptor maps, property installers, `Reflect`, and descriptor-level schema-view contracts.
- [x] Run focused Pongo database and client tests. (51 passed)

## 5. Cleanup and verification

- [x] Remove obsolete scope, projection-export, mixed-input, and placement code/tests.
- [x] Check for dead code and redundant abstractions using the searches from the plan.
- [x] Run PostgreSQL and SQLite migration integration tests. (52 passed)
- [x] Run `npm run build:ts` from `src`.
- [ ] Run `npm run fix` from `src`.
- [ ] Rerun `npm run build:ts` and focused tests after formatting.
- [ ] Review the final diff for unrelated changes and update this todo to completion.
