# Runtime identity hardening plan

## Goal

Prevent values created through one public package entry point from being rejected or misclassified by another entry point, without sharing bundles, using `Symbol.for()`, or adding global-state workarounds.

## Confirmed problems

- A Pongo collection component created by `@event-driven-io/pongo` is rejected by independently bundled driver entries because `pongoCollectionComponentType` is created with `Symbol()` in each bundle.
- The problem is not Cloudflare-specific. It was reproduced with the SQLite3 entry as well.
- Error constructors are also duplicated between independently bundled entries. A `PongoError` produced by the PostgreSQL entry is not an `instanceof` the root `PongoError`, and a Dumbo `InvalidOperationError` produced by the Cloudflare entry is not an `instanceof` the root `InvalidOperationError`.
- `DumboError.isInstanceOf` successfully recognises the cross-entry Dumbo error structurally.

## Related code that is not yet a confirmed failure

- Dumbo uses module-local symbols for its schema-component categories. The construction has the same identity limitation, but no failing supported public flow has been demonstrated yet.
- Pongo and Dumbo currently keep several registries on `globalThis`. This plan must not add another global workaround. Removing those existing registries requires a separate registration-design change and is not part of this fix.
- Dumbo's PostgreSQL pool contains module-local maps. No incorrect public behaviour caused by duplicated pool maps has been demonstrated, so they are not changed by this plan.

## Decisions

- Keep every public entry independently bundled. Do not group root and driver entries and do not move this work to bundleless output.
- Preserve the existing checks that prevent public entries, the CLI, and optional dependencies from leaking into one another.
- Add the ESLint restriction before changing the schema implementation so the existing violations prove that the rule detects this issue.
- Use stable structural data for schema-component classification.
- Refactor the base `SchemaComponent`; do not add a Pongo-only type override to `TableComponent`.
- Use separate properties for the structural component category and its domain-specific specialisation:
  - `componentType`: `table`, `column`, `index`, `databaseSchema`, `database`, or `extension`.
  - `kind`: an optional generic specialisation such as `pongo_collection` or `pongo_index`.
- Remove custom schema identity symbols from both Dumbo and Pongo.
- Treat structural error identification as the supported cross-entry contract. Do not rely on `instanceof` between independently bundled entries.
- Do not change existing global registry behaviour in this work.
- Do not commit or push any changes.

## Target schema model

The base component will preserve both literal types:

```ts
type SchemaComponent<
  ComponentType extends string,
  Kind extends string | undefined = undefined,
> = Readonly<{
  componentType: ComponentType;
  kind: Kind;
  migrations: () => ReadonlyArray<SQLMigration>;
}>;
```

Derived components will propagate `Kind` instead of widening it:

```ts
type TableComponent<
  Columns,
  TableName,
  Indexes,
  Relationships,
  Kind extends string | undefined = undefined,
> = SchemaComponent<'table', Kind> & Readonly<{
  // Existing table members.
}>;
```

The same pattern will be applied to column, index, database-schema, database, and extension components. Factories and transformation methods must retain the inferred literal `kind`.

Pongo collections will use the regular schema type:

```ts
type PongoCollectionComponent<...> =
  TableComponent<..., 'pongo_collection'>;
```

Runtime identification will be structural:

```ts
const isTableComponent = (
  value: unknown,
): value is AnyTableComponent =>
  isSchemaComponent(value) && value.componentType === 'table';

const isPongoCollectionComponent = (
  value: unknown,
): value is PongoCollectionComponent =>
  isTableComponent(value) && value.kind === 'pongo_collection';
```

## Phase 1: Add the ESLint guard first

- [x] Add an ESLint `no-restricted-syntax` selector for direct `Symbol()` calls in `packages/dumbo/src/**/*.ts` and `packages/pongo/src/**/*.ts`.
- [x] Use the rule message: `Use typed structural discriminators instead of module-local symbol identity.`
- [x] Allow standard symbol protocols such as `Symbol.iterator` and `Symbol.toStringTag`; the selector targets only calls whose callee is the `Symbol` identifier.
- [x] Run ESLint and verify that it reports every existing schema identity symbol in Dumbo and Pongo.
- [x] Record the reported files as the migration checklist for Phases 3 and 4.
- [x] Do not add allowlists, inline disables, or temporary exceptions for the existing schema symbols.
- [x] Keep working through Phase 4 before requesting approval because the repository will intentionally remain lint-red until the detected symbols are removed.

### Phase 1 acceptance

- Direct `Symbol()` calls are rejected by the effective ESLint configuration.
- Every existing custom schema identity symbol is reported.
- `Symbol.iterator`, `Symbol.toStringTag`, and other property access on the standard `Symbol` namespace are not rejected.

## Phase 2: Restore and lock the existing bundle boundaries

- [x] Remove the uncommitted Pongo `tsdown` change that groups the root and Cloudflare entries.
- [x] Remove the uncommitted `allowedPublicEntryDependencies` exception from the bundle test.
- [x] Preserve the existing independent-entry, allowed-source, optional-dependency, and CLI boundary assertions.
- [x] Retain the useful runtime consumer test but rewrite it as a driver-entry matrix rather than a Cloudflare-specific test.
- [x] Cover `pg`, `sqlite3`, and `cloudflare` in both ESM and CommonJS.
- [x] In each case, create the schema through the root entry, supply `pongoDriver` from the driver entry, create a client without connecting to external infrastructure, and resolve the declared collection.
- [x] Verify that the new runtime cases fail against the original symbol-based build for the expected collection-classification reason.
- [x] Continue to Phase 3 without weakening or bypassing the ESLint guard.

### Phase 2 acceptance

- The pre-existing bundle boundary assertions have not been weakened.
- The test covers all three driver entry points and both supported module formats.
- The failure represents public Pongo usage and does not inspect symbols or generated chunk names.

## Phase 3: Refactor the complete Dumbo schema-component model

- [x] Replace the symbol-keyed category on `SchemaComponent` with the generic string `componentType` property.
- [x] Add generic `Kind` to `SchemaComponent` and store `kind` on the base component.
- [x] Update `schemaComponent` so both literals are inferred and retained.
- [x] Propagate `Kind` through column, table, index, database-schema, database, and extension component types, option types, and factories.
- [x] Update `Any*Component` aliases and inference helpers without narrowing their existing accepted component sets.
- [x] Preserve `Kind` through operations that return rebuilt components, including table rename/name/schema placement, index table placement, schema table addition, and extension/database placement.
- [x] Replace symbol comparisons in every schema-component guard with `componentType` comparisons.
- [x] Keep existing migration names and ordering unchanged. The existing `kind` value must continue contributing to migration names exactly as before.
- [x] Remove `schemaComponentType`, `tableComponentType`, `columnComponentType`, `indexComponentType`, `databaseSchemaComponentType`, `databaseComponentType`, and `extensionComponentType` after all callers have migrated.
- [x] Update existing schema unit tests to cover every component guard and verify that transformations preserve `componentType`, `kind`, and migrations.
- [x] Add a compile-time regression assertion in the existing schema type-test area proving that a literal `kind` is not widened to `string | undefined`.
- [x] Run the smallest affected Dumbo schema tests and `npm run build:ts`.
- [x] Continue to Phase 4 so the new ESLint rule can return to green without exemptions.

### Phase 3 acceptance

- No Dumbo schema component uses a custom symbol for runtime classification.
- Every component has a stable `componentType`.
- Every component retains its inferred `kind` literal.
- Existing schema migrations remain byte-for-byte equivalent where their inputs did not change.

## Phase 4: Move Pongo to the structural schema model

- [x] Change Pongo collection and index component types to use the generic Dumbo `kind` parameter.
- [x] Remove `pongoCollectionComponentType` from the type, factory output, guards, and exports.
- [x] Update `isPongoCollectionComponent` to require a table component with `kind === 'pongo_collection'`.
- [x] Verify collection transformations retain `kind: 'pongo_collection'`.
- [x] Update affected Pongo schema unit and type tests.
- [x] Build Dumbo and Pongo, then run the ESM/CommonJS driver-entry compatibility matrix from Phase 2.
- [x] Run ESLint and verify that the rule introduced in Phase 1 now passes without exceptions.
- [x] Run `npm run test:unit`.
- [x] Stop for approval before changing the cross-entry error contract in Phase 5.

### Phase 4 acceptance

- The package-boundary matrix passes for `pg`, `sqlite3`, and `cloudflare` in ESM and CommonJS while entries remain independently bundled.
- Pongo no longer contains a custom runtime symbol.
- Dumbo and Pongo pass the direct-`Symbol()` restriction without exceptions.
- Root imports still do not pull in the CLI or unavailable optional drivers.

## Phase 5: Make the cross-entry error contract explicit

- [ ] Add bundle-level tests that obtain representative errors from driver subpaths and recognise them with `DumboError.isInstanceOf` plus the expected `errorType`.
- [ ] Do not assert cross-entry `instanceof`, because independent bundles intentionally have independent constructors.
- [ ] Replace any production or sample code in scope that uses cross-entry `instanceof` for Dumbo/Pongo errors with the existing structural check.
- [ ] Keep same-module `instanceof` checks unchanged unless a test demonstrates that they cross an entry boundary.
- [ ] Document the supported error check in the relevant public API documentation if no equivalent guidance exists.
- [ ] Stop for approval before the final verification phase.

### Phase 5 acceptance

- A consumer can reliably identify errors returned by every relevant driver entry without constructor identity.
- No new error abstraction is introduced when the existing `DumboError.isInstanceOf` API is sufficient.

## Phase 6: Complete verification

- [ ] Confirm the Phase 1 ESLint guard remains enabled for all Dumbo and Pongo source files.
- [ ] Keep the runtime compatibility matrix in `npm run test:bundles`; `.github/workflows/build_and_test.yml` already builds the package artifacts and runs that command for pull requests changing `src/**`.
- [ ] Run `npm run agent:check`.
- [ ] Run `npm run test:bundles` after building Dumbo and Pongo.
- [ ] Run `npm run test:unit`.
- [ ] Run the complete `npm test` before final handoff, as required for application-code changes.
- [ ] Stop with the uncommitted diff and verification results. Do not commit or push.

### Phase 6 acceptance

- A future direct `Symbol()` runtime brand fails lint.
- A future cross-entry schema incompatibility fails the bundle suite in CI.
- A future widening of schema `kind` fails type validation.
- Existing CLI and optional-dependency boundary regressions still fail the bundle suite.

## Explicitly out of scope

- Combining public bundle entries or switching the packages to bundleless output.
- Adding `Symbol.for()`.
- Adding another `globalThis` property, `WeakMap`, monkey patch, or cross-package singleton workaround.
- Removing existing global registries without an independently reviewed explicit-registration design.
- Changing PostgreSQL pooling without a reproduced behavioural failure.
- Cloudflare sample implementation work; resume it only after this package fix is accepted.

## Final verification report

The handoff must list every command run, whether it passed, and any skipped check with its reason. A green local bundle suite is necessary but not sufficient; the existing `Build application code` GitHub Actions job must also pass after the branch is pushed by the user.
