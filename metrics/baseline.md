# Baseline metrics

- Branch: `schema_features`
- HEAD: `6087f453ec0e65f9aa4b27061a8a791eba2afb9e` ("f")
- Recorded: 2026-08-03
- Working tree at time of measurement: 7 modified files (uncommitted), listed at the bottom.

Counting rules: `*.ts` files only, `dist/` and `node_modules/` excluded. "Source" excludes
`*.spec.ts`; "Test" counts only `*.spec.ts`.

## 1. Non-test source line counts

| Area                                                       | Files | Lines     |
| ---------------------------------------------------------- | ----: | --------: |
| `src/packages/dumbo/src/core/schema/` (tree)                |    26 |     3,044 |
| `src/packages/dumbo/src/core/sql/` (tree)                   |    21 |     1,697 |
| `src/packages/dumbo/src/storage/postgresql/core/schema/`    |     5 |       160 |
| `src/packages/dumbo/src/storage/sqlite/core/schema/`        |     6 |       200 |
| `src/packages/pongo/src/storage/` (tree)                    |    16 |     1,781 |
| `src/packages/pongo/src/core/database/pongoDb.ts`           |     1 |       359 |
| **Subtotal (areas above)**                                  |  **75** | **7,241** |

### Grand totals across both packages

| Package                        | Files | Source lines | Test files | Test lines |
| ------------------------------ | ----: | -----------: | ---------: | ---------: |
| `src/packages/dumbo/src/`       |   165 |       14,584 |         72 |     21,423 |
| `src/packages/pongo/src/`       |    67 |        8,241 |         38 |     20,568 |
| **Grand total**                 | **232** |   **22,825** |    **110** | **41,991** |

### Per file — `src/packages/dumbo/src/core/schema/`

| File                                                     | Lines |
| -------------------------------------------------------- | ----: |
| `components/relationships/relationshipValidation.ts`      |   567 |
| `migrators/migrator.ts`                                   |   306 |
| `components/relationships/relationshipTypes.ts`           |   249 |
| `dumboSchema/dumboSchema.ts`                              |   242 |
| `components/databaseMigrations.ts`                        |   200 |
| `schemaComponent.ts`                                      |   192 |
| `components/indexComponent.ts`                            |   165 |
| `components/relationships/formatRelationshipErrors.ts`    |   155 |
| `databaseMetadata/databaseMetadata.ts`                    |   149 |
| `components/tableComponent.ts`                            |   148 |
| `components/databaseComponent.ts`                         |   106 |
| `components/databaseSchemaComponent.ts`                   |   101 |
| `migrators/schemaComponentMigrator.ts`                    |    88 |
| `components/logicalSchemaMapping.ts`                      |    80 |
| `components/columnSchemaComponent.ts`                     |    74 |
| `components/tableTypesInference.ts`                       |    61 |
| `extensionComponent.ts`                                   |    49 |
| `components/withTable.ts`                                 |    37 |
| `sqlMigration.ts`                                         |    21 |
| `index.ts`                                                |    20 |
| `components/createTableSQL.ts`                            |    14 |
| `components/index.ts`                                     |    11 |
| `components/relationships/index.ts`                       |     5 |
| `migrators/index.ts`                                      |     2 |
| `databaseMetadata/index.ts`                               |     1 |
| `dumboSchema/index.ts`                                    |     1 |
| **Total**                                                 | **3,044** |

## 2. Test line counts

| Area                                                       | Spec files | Lines     |
| ---------------------------------------------------------- | ---------: | --------: |
| `src/packages/dumbo/src/core/schema/` (tree)                |         18 |     4,687 |
| `src/packages/dumbo/src/core/sql/` (tree)                   |          3 |       715 |
| `src/packages/dumbo/src/storage/postgresql/core/schema/`    |          2 |       569 |
| `src/packages/dumbo/src/storage/sqlite/core/schema/`        |          4 |       712 |
| `src/packages/pongo/src/storage/` (tree)                    |          9 |     2,663 |
| `src/packages/pongo/src/core/database/pongoDb.ts`           |          0 |         0 |
| **Subtotal (areas above)**                                  |     **36** | **9,346** |
| **Grand total, both packages**                              |    **110** | **41,991** |

`pongoDb.ts` has no co-located spec file.

## 3. Exported symbols (transitive, resolved through `export *`)

| Barrel                                                | Exported symbols |
| ----------------------------------------------------- | ---------------: |
| `src/packages/dumbo/src/core/schema/index.ts`          |              169 |
| `src/packages/dumbo/src/core/schema/components/index.ts` |            128 |

Measured with the TypeScript compiler API (`checker.getExportsOfModule`), so `export *`
re-exports are counted once each; types and values both included.

## 4. Deletion checklist (from `spec.md`)

Reference counts are `*.ts` occurrences across `src/packages` (declaration + all usages,
tests included), taken at this HEAD.

- [ ] `schemaComponentState` — 5 refs
- [ ] `localMigrationsOf` — 7 refs
- [ ] `migrationsFor` — 21 refs
- [ ] `DatabaseMigrationBuilder` — 10 refs
- [ ] `databaseMigrations` — 19 refs
- [ ] `pongoPostgreSQLMigrationBuilder` — 5 refs
- [ ] `pongoSQLiteMigrationBuilder` — 7 refs
- [ ] `postgreSQLTableSQL` — 3 refs
- [ ] `postgreSQLIndexSQL` — 8 refs
- [ ] `postgreSQLDatabaseSchemaSQL` — 3 refs
- [ ] `sqliteTableSQL` — 3 refs
- [ ] `sqliteIndexSQL` — 8 refs
- [ ] `pongoCollectionMigrationName` — 5 refs
- [ ] `pongoDatabaseSchemaMigrationName` — 3 refs
- [ ] `pongoIndexMigrationName` — 5 refs
- [ ] `databaseName` field on `DatabaseSchemaComponent`

Both `DatabaseMigrationBuilder` and `databaseMigrations` are currently public exports of
`core/schema/index.ts` and `core/schema/components/index.ts`, so removing them drops the
barrel counts in section 3.

## 5. Build and lint at baseline

Run from `/home/oskar/Repos/Pongo/src`:

| Command             | Result |
| ------------------- | ------ |
| `npm run build:ts`  | Clean — `tsc -b` produced no output, exit 0. |
| `npm run fix`       | Clean — `fix:eslint` no findings, `fix:prettier` no source changes, exit 0. |

One caveat on `npm run fix`: `fix:prettier` reformatted the untracked working document
`/home/oskar/Repos/Pongo/plan.md` (651 insertions, 736 deletions — formatting only). That
reformat was reverted to keep the tree as found; it is pre-existing drift in a doc, not a
code failure. No `.ts` file was touched by either command.

Modified files present in the working tree when this baseline was taken (all pre-existing,
none created by this step):

- `src/packages/dumbo/src/core/schema/components/databaseComponent.ts`
- `src/packages/dumbo/src/core/schema/components/databaseSchemaComponent.ts`
- `src/packages/dumbo/src/core/schema/components/tableComponent.ts`
- `src/packages/dumbo/src/core/schema/extensionComponent.ts`
- `src/packages/dumbo/src/core/schema/index.ts`
- `src/packages/dumbo/src/core/schema/schemaComponent.ts`
- `src/packages/dumbo/src/core/sql/tokens/sqlToken.ts`
