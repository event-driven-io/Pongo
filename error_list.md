# Raw `Error` throws to migrate

Inventory of every `throw new Error(...)` / `throw Error(...)` in `src/packages`.
Target: Dumbo code throws `DumboError` (or one of its subclasses), Pongo code throws `PongoError`.

Counts: **41** production sites in Dumbo, **47** in Pongo (22 of those are `Method not implemented.` stubs).
Spec files add 28 (Dumbo) + 11 (Pongo) — listed separately at the bottom; most are deliberate test doubles.

Paths are relative to `src/`.

---

## Dumbo — production code (41)

### `core/sql` (13)

| File | Line | Message | Suggested type |
| --- | --- | --- | --- |
| `packages/dumbo/src/core/sql/formatters/sqlFormatter.ts` | 98 | `No SQL formatter registered for dialect: ${dialect}` | `InvalidOperationError` |
| `packages/dumbo/src/core/sql/formatters/sqlFormatter.ts` | 124 | `Expected TokenizedSQL, got string-based SQL` | `InvalidOperationError` |
| `packages/dumbo/src/core/sql/formatters/sqlFormatter.ts` | 146 | `No SQL processor registered for token type: ${token.sqlTokenType}` | `InvalidOperationError` |
| `packages/dumbo/src/core/sql/processors/sqlProcessor.ts` | 37 | `No SQL processor registered for ${token.sqlTokenType}` | `InvalidOperationError` |
| `packages/dumbo/src/core/sql/processors/columnProcessors.ts` | 23 | `Unsupported SQL token "..." as a column default` | `InvalidOperationError` |
| `packages/dumbo/src/core/sql/processors/columnProcessors.ts` | 69 | `No SQL processor registered for column type: ...` | `InvalidOperationError` |
| `packages/dumbo/src/core/sql/processors/defaultProcessors.ts` | 12 | `Empty arrays are not supported...` | `DataError` |
| `packages/dumbo/src/core/sql/processors/defaultProcessors.ts` | 37 | `No sql processor registered for an array. Cannot expand IN statement` | `InvalidOperationError` |
| `packages/dumbo/src/core/sql/tokens/sqlToken.ts` | 40 | `Cannot create SQLToken of type ${sqlTokenType} with input: ...` | `DataError` |
| `packages/dumbo/src/core/sql/tokens/columnTokens.ts` | 106 | `Cannot create SQLToken of type ${sqlTokenType} with input: ...` | `DataError` |
| `packages/dumbo/src/core/sql/valueMappers/sqlValueMapper.ts` | 50 | `SQL identifier cannot be null or undefined` | `DataError` |
| `packages/dumbo/src/storage/postgresql/core/sql/processors/arrayProcessors.ts` | 15 | `Empty arrays are not supported...` | `DataError` |
| `packages/dumbo/src/storage/postgresql/core/sql/processors/arrayProcessors.ts` | 47 | `No sql processor registered for an array. Cannot expand IN statement` | `InvalidOperationError` |

### `core/schema` (12)

| File | Line | Message | Suggested type |
| --- | --- | --- | --- |
| `packages/dumbo/src/core/schema/schemaComponent.ts` | 57 | `Duplicate migration name "..." in schema component tree` | `InvalidOperationError` |
| `packages/dumbo/src/core/schema/components/database/databaseComponent.ts` | 185 | `A database declaration can contain either tables or schemas, not both` | `InvalidOperationError` |
| `packages/dumbo/src/core/schema/components/databaseSchema/databaseSchemaComponent.ts` | 52 | `Table "..." is declared more than once in database schema "..."` | `InvalidOperationError` |
| `packages/dumbo/src/core/schema/components/databaseSchema/databaseSchemaComponent.ts` | 64 | `Database schema record key cannot be an empty string` | `InvalidOperationError` |
| `packages/dumbo/src/core/schema/components/databaseSchema/databaseSchemaComponent.ts` | 148 | `A database schema name cannot be empty...` | `InvalidOperationError` |
| `packages/dumbo/src/core/schema/components/databaseSchema/databaseSchemaComponent.ts` | 162 | `Extension "..." contributes database schema "..."` | `InvalidOperationError` |
| `packages/dumbo/src/core/schema/components/tableIndex/indexComponent.ts` | 157 | `Index "..." cannot be created outside a table...` | `InvalidOperationError` |
| `packages/dumbo/src/core/schema/migrators/migrator.ts` | 38 | `No default migrator options registered for database type: ...` | `InvalidOperationError` |
| `packages/dumbo/src/core/schema/migrators/migrator.ts` | 96 | `Migration name "..." is N characters long, exceeding the maximum...` | `InvalidOperationError` |
| `packages/dumbo/src/core/schema/migrators/migrator.ts` | 233 | `Migration hash mismatch for "...". Aborting migration.` | `InvalidOperationError` (own `MigrationHashMismatchError`?) |
| `packages/dumbo/src/storage/sqlite/core/schema/sqlitePhysicalNames.ts` | 12 | `SQLite ${kind} names containing . are reserved...` | `InvalidOperationError` |
| `packages/dumbo/src/storage/postgresql/core/locks/advisoryLocks.ts` | 77 | `Failed to acquire advisory lock within the specified timeout. Migration aborted.` | `LockNotAvailableError` |

### connections, transactions, execution (7)

| File | Line | Message | Suggested type |
| --- | --- | --- | --- |
| `packages/dumbo/src/core/connections/transaction.ts` | 60 | `Transaction level is out of bounds` | `InvalidOperationError` |
| `packages/dumbo/src/core/connections/transaction.ts` | 409 | `Transaction not started - call begin() first` | `InvalidOperationError` |
| `packages/dumbo/src/core/connections/transaction.ts` | 437 | `Transaction not started` | `InvalidOperationError` |
| `packages/dumbo/src/core/taskProcessing/executionGuards.ts` | 155 | `Acquired resource is not active` | `InvalidOperationError` |
| `packages/dumbo/src/storage/sqlite/d1/transactions/d1Transaction.ts` | 123 | `Transaction has not been started. Call begin() first.` | `InvalidOperationError` |
| `packages/dumbo/src/storage/sqlite/d1/pool/d1ConnectionPool.ts` | 41 | `D1 database or connection is required` | `InvalidOperationError` |
| `packages/dumbo/src/core/query/selectors.ts` | 19, 31, 42, 44 | `Query didn't return any result` / `Query had more than one result` (4 sites) | `DataError` |

### connection strings & driver registry (5)

| File | Line | Message | Suggested type |
| --- | --- | --- | --- |
| `packages/dumbo/src/storage/all/connections/connectionString.ts` | 42 | `Unsupported database connection string: ...` | `InvalidOperationError` |
| `packages/dumbo/src/storage/all/index.ts` | 38 | `No plugin found for driver type: ${driverType}` | `InvalidOperationError` |
| `packages/dumbo/src/storage/postgresql/core/connections/connectionString.ts` | 18 | `Invalid PostgreSQL connection string: ...` | `InvalidOperationError` |
| `packages/dumbo/src/storage/sqlite/core/connections/connectionString.ts` | 27 | `Invalid SQLite connection string: ...` | `InvalidOperationError` |
| `packages/dumbo/src/storage/postgresql/core/sql/processors/columProcessors.ts` | 57 | `Unknown column type: ${exhaustiveCheck}` (exhaustiveness guard) | `InvalidOperationError` |
| `packages/dumbo/src/storage/sqlite/core/sql/processors/columProcessors.ts` | 57 | `Unknown column type: ${exhaustiveCheck}` (exhaustiveness guard) | `InvalidOperationError` |

---

## Pongo — production code (47)

### core (13)

| File | Line | Message | Suggested type |
| --- | --- | --- | --- |
| `packages/pongo/src/index.ts` | 24 | `Unknown path: ${path}` | `PongoError` |
| `packages/pongo/src/index.ts` | 28 | `Failed to load Pongo client for ${path}` | `PongoError` |
| `packages/pongo/src/core/schema/index.ts` | 382 | `You need to provide a database declaration` | `PongoError` |
| `packages/pongo/src/core/schema/index.ts` | 388 | `A Pongo database declaration must contain exactly one of collections or schemas` | `PongoError` |
| `packages/pongo/src/core/collection/pongoCollection.ts` | 813 | `replaceMany with upsert cannot mix documents with and without _version...` | `PongoError` |
| `packages/pongo/src/core/database/pongoDatabaseComponent.ts` | 74 | `Table "..." in ... is not a Pongo collection` | `PongoError` |
| `packages/pongo/src/core/database/pongoDatabaseComponent.ts` | 84 | `Cannot add collection "..." because that alias already refers to table "..."` | `PongoError` |
| `packages/pongo/src/core/database/pongoDatabaseCache.ts` | 96 | `The ... driver is already bound to database ... and cannot switch to ...` | `PongoError` |
| `packages/pongo/src/core/database/pongoDatabaseCache.ts` | 107 | `Database "..." is already set up. Call db("...") without options to reuse it` | `PongoError` |
| `packages/pongo/src/core/pongoSession.ts` | 22 | `No active transaction exists!` | `PongoError` |
| `packages/pongo/src/core/pongoSession.ts` | 29 | `Active transaction already exists!` | `PongoError` |
| `packages/pongo/src/core/pongoTransaction.ts` | 58 | `There's already other database assigned to transaction` | `PongoError` |
| `packages/pongo/src/core/pongoTransaction.ts` | 72 | `Transaction is not active!` | `PongoError` |
| `packages/pongo/src/core/pongoTransaction.ts` | 83 | `Cannot rollback commited transaction!` | `PongoError` |
| `packages/pongo/src/core/pongoTransaction.ts` | 102 | `No database transaction was started` | `PongoError` |

### storage / SQL builders (8)

| File | Line | Message | Suggested type |
| --- | --- | --- | --- |
| `packages/pongo/src/storage/postgresql/core/sqlBuilder/filter/index.ts` | 143 | `Unsupported root operator: ${operator}` | `PongoError` |
| `packages/pongo/src/storage/postgresql/core/sqlBuilder/filter/queryOperators.ts` | 61 | `Unsupported operator: ${operator}` | `PongoError` |
| `packages/pongo/src/storage/postgresql/core/sqlBuilder/filter/queryOperators.ts` | 84 | `Unsupported operator: ${operator}` | `PongoError` |
| `packages/pongo/src/storage/sqlite/core/sqlBuilder/filter/index.ts` | 143 | `Unsupported root operator: ${operator}` | `PongoError` |
| `packages/pongo/src/storage/sqlite/core/sqlBuilder/filter/queryOperators.ts` | 81 | `Unsupported operator: ${operator}` | `PongoError` |
| `packages/pongo/src/storage/sqlite/core/sqlBuilder/filter/queryOperators.ts` | 116 | `Unsupported operator: ${operator}` | `PongoError` |
| `packages/pongo/src/storage/postgresql/pg/index.ts` | 53 | `The ambient PostgreSQL connection is connected to database ... and cannot be used for ...` | `PongoError` |
| `packages/pongo/src/storage/sqlite/d1/index.ts` | 60 | `D1 database or connection is required` | `PongoError` |

### mongo compatibility layer (24)

| File | Line | Message | Suggested type |
| --- | --- | --- | --- |
| `packages/pongo/src/mongo/mongoClient.ts` | 61 | `No database driver registered for ${databaseType} with name ${driverName}` | `PongoError` |
| `packages/pongo/src/mongo/findCursor.ts` | 24 | `Error while fetching documents` (uses `throw Error(...)`, no `new`) | `PongoError` |
| `packages/pongo/src/mongo/mongoCollection.ts` | 154, 187, 324, 327, 333, 339, 345, 348, 351, 357, 375, 422, 440, 528, 537, 542, 545, 564, 567, 572, 575, 578 | `Method not implemented.` (22 sites) | `NotImplementedError extends PongoError` (501) |

---

## Non-throwing raw `Error` in production code

Not `throw`s, but the same "raw Error escapes to callers" problem — abort reasons and rejections that user code sees:

| File | Line | Usage |
| --- | --- | --- |
| `packages/dumbo/src/core/connections/pool.ts` | 109 | `new Error('Singleton connection pool has been closed')` as abort reason |
| `packages/dumbo/src/core/connections/pool.ts` | 231 | `new Error('Bounded connection pool has been closed')` as abort reason |
| `packages/dumbo/src/core/taskProcessing/taskProcessor.ts` | 361 | `new Error('Task was not started within the maximum waiting time')` as abort reason |
| `packages/dumbo/src/storage/sqlite/sqlite3/connections/connection.ts` | 172, 191, 264 | `reject(error instanceof Error ? error : new Error(String(error)))` — wraps non-Error rejections |

---

## Gaps in the error types themselves

- `PongoError` (`packages/pongo/src/core/errors/index.ts`) is much thinner than `DumboError`: no `errorType`, no `innerError`/`cause`, no static `isInstanceOf`. Worth aligning before the migration so Pongo call sites can carry the original error.
- Pongo currently ships only `PongoError` and `ConcurrencyError`. The sites above suggest at least `InvalidOperationError` and `NotImplementedError` equivalents.
- `packages/pongo/src/core/errors/index.ts` also exports `isNumber`/`isString`, duplicating Dumbo's private copies.

---

## Spec files (not migration targets, listed for completeness)

Most spec throws are intentional test doubles (`'boom'`, `'Intentionally throwing'`, `'rollback'`, abort reasons) and should stay raw `Error`.

Dumbo (28): `core/execute/execute.unit.spec.ts:111`, `core/taskProcessing/abort.unit.spec.ts:41`, `core/taskProcessing/executionGuards.unit.spec.ts:427`, `core/taskProcessing/taskProcessor.unit.spec.ts:829`, `storage/postgresql/pg/connections/connection.int.spec.ts:341,369`, `storage/sqlite/d1/transactions/transactions.int.spec.ts:239,304,409,474`, `storage/sqlite/sqlite3/pool/dualPool.int.spec.ts:46,67,96,138,165,173,200,233,240,278,285`, `storage/sqlite/sqlite3/transactions/transactions.int.spec.ts:177,230,323,375,636,678,724`.

Pongo (11): `core/cache/pongoCacheWrapper.unit.spec.ts:72,81,92,103,117,130`, `core/pongoClient.unit.spec.ts:93`, `storage/postgresql/pg/migrations.int.spec.ts:135`, `storage/postgresql/pg/rename.int.spec.ts:260`, `storage/sqlite/sqlite3/migrations.int.spec.ts:108`, `storage/sqlite/sqlite3/rename.int.spec.ts:286`.
