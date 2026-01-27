# SQLite Server Optimization Implementation Plan

## Summary

Implement server-optimized SQLite configuration in Dumbo's core SQLite layer. Changes are shared across all SQLite drivers (sqlite3, future drivers).

Based on research from:
- https://kerkour.com/sqlite-for-servers
- https://lobste.rs/s/yapvon/what_do_about_sqlite_busy_errors_despite
- https://til.simonwillison.net/sqlite/enabling-wal-mode
- https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/

**Three critical fixes:**

1. **PRAGMA configuration** - Server-optimized defaults (WAL mode, 1GB cache, foreign keys on)
2. **BEGIN IMMEDIATE transactions** - Eliminates SQLITE_BUSY errors by acquiring write locks upfront
3. **Dual connection pool** - 1 writer + N readers exploits WAL's concurrent read capability

**Architecture:** 90% core layer (shared), 10% driver-specific (sqlite3 PRAGMA execution).

---

## Current State

### Core Layer (Shared)

**Exists:**
- Pool types (Ambient, Singleton, Always-New) in [core/pool/pool.ts](src/packages/dumbo/src/core/connections/pool.ts)
- Command/query separation in [core/execute/execute.ts](src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts)
- Transaction framework in [core/transactions/index.ts](src/packages/dumbo/src/storage/sqlite/core/transactions/index.ts)
- Connection string validation in [core/connections/connectionString.ts](src/packages/dumbo/src/storage/sqlite/core/connections/connectionString.ts)

**Missing:**
- PRAGMA configuration types and defaults
- Connection string PRAGMA parsing
- BEGIN IMMEDIATE transactions
- Dual connection pools (1 writer, N readers)
- Bounded connection pool infrastructure

### sqlite3 Driver

**Exists:**
- WAL mode set on connection (line 79 in [sqlite3/connections/connection.ts](src/packages/dumbo/src/storage/sqlite/sqlite3/connections/connection.ts#L79))
- Connection creation via sqlite3 package

**Missing:**
- Application of PRAGMAs beyond WAL
- Integration with core PRAGMA configuration

---

## Implementation Sequence

Execute in this order to maintain dependencies:

### Core Layer (Steps 1-6)

1. **Create** `storage/sqlite/core/connections/pragmas.ts` - Shared PRAGMA helpers
2. **Update** `storage/sqlite/core/connections/index.ts` - Add PRAGMA types (~line 362)
3. **Update** `storage/sqlite/core/connections/connectionString.ts` - Add PRAGMA parser
4. **Update** `storage/sqlite/core/execute/execute.ts` - Delete per-query busy_timeout (lines 43-45, 71-73, 93-95, 110-112)
5. **Update** `storage/sqlite/core/transactions/index.ts` - Implement BEGIN IMMEDIATE (line 56)
6. **Update** `core/connections/pool.ts` - Add `createBoundedConnectionPool` function (after line 103)

### SQLite-Specific Layer (Steps 7-9)

7. **Create** `storage/sqlite/core/pool/dualPool.ts` - Dual pool implementation
8. **Update** `storage/sqlite/core/pool/pool.ts` - Add dual pool routing and default strategy
9. **Update** `sqlite3/connections/connection.ts` - Apply PRAGMAs using core helpers, remove line 79

### Verification (Step 10)

10. **Test** - Run verification plan (see section below)

---

## Phase 1: PRAGMA Configuration

### 1.1 Add PRAGMA Type Definitions

**File:** `src/packages/dumbo/src/storage/sqlite/core/connections/index.ts`

Add after `SQLiteClientOptions` type (~line 362):

```typescript
export type SQLitePragmaOptions = {
  journal_mode?: "DELETE" | "TRUNCATE" | "PERSIST" | "MEMORY" | "WAL" | "OFF";
  synchronous?: "OFF" | "NORMAL" | "FULL" | "EXTRA";
  cache_size?: number; // negative = KB, positive = pages
  foreign_keys?: boolean;
  temp_store?: "DEFAULT" | "FILE" | "MEMORY";
  busy_timeout?: number; // milliseconds
};

export const DEFAULT_SQLITE_PRAGMA_OPTIONS: SQLitePragmaOptions = {
  journal_mode: "WAL",
  synchronous: "NORMAL", // Safe with WAL
  cache_size: -1000000, // 1GB cache
  foreign_keys: true, // BREAKING: May fail on invalid FKs
  temp_store: "MEMORY",
  busy_timeout: 5000, // 5 seconds
};
```

Update `SQLiteClientOptions`:

```typescript
export type SQLiteClientOptions = {
  // ... existing fields
  pragmaOptions?: Partial<SQLitePragmaOptions>;
};
```

### 1.2 Connection String PRAGMA Parsing

**File:** `src/packages/dumbo/src/storage/sqlite/core/connections/connectionString.ts`

Add new function:

```typescript
export const parsePragmasFromConnectionString = (
  connectionString: string | SQLiteConnectionString,
): Partial<SQLitePragmaOptions> => {
  const str = String(connectionString);

  // Only parse query params from file: URIs
  if (!str.startsWith("file:")) {
    return {};
  }

  const url = new URL(str);
  const params = url.searchParams;
  const pragmas: Partial<SQLitePragmaOptions> = {};

  if (params.has("journal_mode")) {
    pragmas.journal_mode = params.get("journal_mode") as any;
  }
  if (params.has("synchronous")) {
    pragmas.synchronous = params.get("synchronous") as any;
  }
  if (params.has("cache_size")) {
    pragmas.cache_size = parseInt(params.get("cache_size")!, 10);
  }
  if (params.has("foreign_keys")) {
    const val = params.get("foreign_keys")!.toLowerCase();
    pragmas.foreign_keys = val === "true" || val === "on" || val === "1";
  }
  if (params.has("temp_store")) {
    pragmas.temp_store = params.get("temp_store")!.toUpperCase() as any;
  }
  if (params.has("busy_timeout")) {
    pragmas.busy_timeout = parseInt(params.get("busy_timeout")!, 10);
  }

  return pragmas;
};
```

### 1.3 Create Core PRAGMA Helpers

**File:** `src/packages/dumbo/src/storage/sqlite/core/connections/pragmas.ts` (NEW)

```typescript
import { parsePragmasFromConnectionString } from "./connectionString";
import {
  DEFAULT_SQLITE_PRAGMA_OPTIONS,
  type SQLitePragmaOptions,
} from "./index";

export const mergePragmaOptions = (
  connectionString: string,
  userOptions?: Partial<SQLitePragmaOptions>,
): SQLitePragmaOptions => {
  const connectionStringPragmas =
    parsePragmasFromConnectionString(connectionString);

  return {
    ...DEFAULT_SQLITE_PRAGMA_OPTIONS,
    ...connectionStringPragmas,
    ...userOptions,
  };
};

export const buildPragmaStatements = (
  pragmas: SQLitePragmaOptions,
): Array<{ pragma: string; value: string | number }> => {
  return [
    { pragma: "journal_mode", value: pragmas.journal_mode! },
    { pragma: "synchronous", value: pragmas.synchronous! },
    { pragma: "cache_size", value: pragmas.cache_size! },
    { pragma: "foreign_keys", value: pragmas.foreign_keys ? "ON" : "OFF" },
    { pragma: "temp_store", value: pragmas.temp_store! },
    { pragma: "busy_timeout", value: pragmas.busy_timeout! },
  ];
};
```

### 1.4 Apply PRAGMAs in sqlite3 Driver

**File:** `src/packages/dumbo/src/storage/sqlite/sqlite3/connections/connection.ts`

Modify `sqlite3Client` function (~line 57):

```typescript
import {
  mergePragmaOptions,
  buildPragmaStatements,
} from "../../core/connections/pragmas";

export const sqlite3Client = (
  options: SQLite3ConnectionOptions,
): SQLite3Connection => {
  const fileName = getSQLiteConnectionString(options);

  // Merge PRAGMA options using shared helper
  const finalPragmas = mergePragmaOptions(
    String(fileName),
    options.pragmaOptions,
  );

  const connect = () =>
    new Promise<void>((resolve, reject) => {
      try {
        const db = new sqlite3.Database(/* existing params */);
        // ... existing code ...

        // Apply all PRAGMAs sequentially
        const pragmaStatements = buildPragmaStatements(finalPragmas);
        const applyPragma = (pragma: string, value: string | number) => {
          return new Promise<void>((resolve, reject) => {
            db.run(`PRAGMA ${pragma} = ${value};`, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        };

        // Execute PRAGMAs in sequence
        pragmaStatements
          .reduce(
            (promise, { pragma, value }) =>
              promise.then(() => applyPragma(pragma, value)),
            Promise.resolve(),
          )
          .then(() => resolve())
          .catch(reject);
      } catch (error) {
        reject(error as Error);
      }
    });

  // ... rest of function
};
```

**Remove old WAL setting** at line 79 (now handled by PRAGMA loop).

**Benefits:**
- Shared logic in core layer
- Other SQLite drivers (node:sqlite, future drivers) can reuse helpers
- Each driver implements its own PRAGMA execution

### 1.5 Remove Per-Query busy_timeout

**File:** `src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts`

Delete these lines:

- **Lines 43-45** (in `query` method)
- **Lines 71-73** (in `batchQuery` method)
- **Lines 93-95** (in `command` method)
- **Lines 110-112** (in `batchCommand` method)

```typescript
// DELETE THESE BLOCKS:
if (options?.timeoutMs !== undefined) {
  await command(SQL`PRAGMA busy_timeout = ${options.timeoutMs};`);
}
```

**Rationale:** busy_timeout should be connection-level (set once via PRAGMA), not per-query. See Appendix for details.

---

## Phase 2: BEGIN IMMEDIATE Transactions

### 2.1 Add Transaction Mode Configuration

**File:** `src/packages/dumbo/src/storage/sqlite/core/connections/index.ts`

Update `DatabaseTransactionOptions`:

```typescript
export type DatabaseTransactionOptions = {
  mode?: "IMMEDIATE" | "DEFERRED" | "EXCLUSIVE";
  allowNestedTransactions?: boolean;
};
```

Add to `SQLiteClientOptions`:

```typescript
export type SQLiteClientOptions = {
  // ... existing fields
  defaultTransactionMode?: "IMMEDIATE" | "DEFERRED" | "EXCLUSIVE";
};
```

### 2.2 Implement Transaction Mode

**File:** `src/packages/dumbo/src/storage/sqlite/core/transactions/index.ts`

Modify `begin` method (line 41):

```typescript
begin: async (options?: DatabaseTransactionOptions) => {
  const mode = options?.mode ?? 'IMMEDIATE'; // Default to IMMEDIATE
  const allowNestedTransactions = options?.allowNestedTransactions ?? false;

  if (nestingCounter > 0) {
    if (!allowNestedTransactions) {
      throw new Error('SQLITE_ERROR: cannot start a transaction within a transaction');
    }

    // Nested transactions use SAVEPOINT (no mode)
    await execute.command(SQL`SAVEPOINT transaction${nestingCounter};`);
    nestingCounter++;
    return;
  }

  // Top-level transaction: use specified mode
  await execute.command(SQL`BEGIN ${SQL.plain(mode)} TRANSACTION;`);
  nestingCounter++;
},
```

**Critical change:** Line 56 changes from `BEGIN TRANSACTION` to `BEGIN ${mode} TRANSACTION`.

**Why BEGIN IMMEDIATE?** See Appendix: Architecture Rationale for detailed explanation. Short version: DEFERRED transactions bypass busy_timeout during lock upgrades, causing immediate SQLITE_BUSY errors. IMMEDIATE acquires write lock upfront, allowing busy_timeout to work.

---

## Phase 3: Dual Connection Pool

### 3.1 Create Bounded Connection Pool

**File:** `src/packages/dumbo/src/core/connections/pool.ts`

Add after line 103:

```typescript
export const createBoundedConnectionPool = <ConnectionType extends Connection>({
  driverType,
  getConnection,
  maxConnections,
}: {
  driverType: ConnectionType["driverType"];
  getConnection: () => ConnectionType | Promise<ConnectionType>;
  maxConnections: number;
}): ConnectionPool<ConnectionType> => {
  const pool: ConnectionType[] = [];
  const waitQueue: Array<(conn: ConnectionType) => void> = [];
  let activeCount = 0;

  const acquire = async (): Promise<ConnectionType> => {
    // If available connection in pool, reuse it
    if (pool.length > 0) {
      return pool.pop()!;
    }

    // If under max, create new
    if (activeCount < maxConnections) {
      activeCount++;
      return await getConnection();
    }

    // Wait for available connection
    return new Promise((resolve) => {
      waitQueue.push(resolve);
    });
  };

  const release = (conn: ConnectionType) => {
    // If someone waiting, give them this connection
    if (waitQueue.length > 0) {
      const next = waitQueue.shift()!;
      next(conn);
      return;
    }

    // Otherwise return to pool
    pool.push(conn);
  };

  // Return pool interface wrapping acquire/release
  // ... implement ConnectionPool interface
};
```

### 3.2 Create Dual Pool Implementation

**File:** `src/packages/dumbo/src/storage/sqlite/core/pool/dualPool.ts` (NEW)

```typescript
import { createSingletonConnectionPool, createBoundedConnectionPool } from '../../../../core';
import { cpus } from 'os';
import type { SQLiteConnectionFactory, SQLiteConnectionOptions, AnySQLiteConnection } from '../connections';
import type { SQLitePool } from './pool';

export type SQLiteDualPoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions,
> = {
  dual: true;
  singleton?: never;
  pooled?: never;
  readerPoolSize?: number;
  driverType: SQLiteConnectionType["driverType"];
  sqliteConnectionFactory: SQLiteConnectionFactory<SQLiteConnectionType, ConnectionOptions>;
  connectionOptions: ConnectionOptions;
};

export const sqliteDualConnectionPool = <
  SQLiteConnectionType extends AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions,
>(
  options: SQLiteDualPoolOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLitePool<SQLiteConnectionType> => {
  const { sqliteConnectionFactory, connectionOptions } = options;
  const readerPoolSize = options.readerPoolSize ?? Math.max(4, cpus().length);

  // Writer pool: Single connection (serializes writes)
  const writerPool = createSingletonConnectionPool({
    driverType: options.driverType,
    getConnection: () => sqliteConnectionFactory(connectionOptions),
  });

  // Reader pool: Multiple connections (parallel reads)
  const readerPool = createBoundedConnectionPool({
    driverType: options.driverType,
    getConnection: () => sqliteConnectionFactory(connectionOptions),
    maxConnections: readerPoolSize,
  });

  // Route commands to writer, queries to reader
  return {
    driverType: options.driverType,
    execute: {
      query: readerPool.execute.query,
      batchQuery: readerPool.execute.batchQuery,
      command: writerPool.execute.command,
      batchCommand: writerPool.execute.batchCommand,
    },
    withTransaction: writerPool.withTransaction, // Transactions use writer
    close: () => Promise.all([writerPool.close(), readerPool.close()]),
    // ... rest of pool interface
  };
};
```

### 3.3 Update Pool Strategy Logic

**File:** `src/packages/dumbo/src/storage/sqlite/core/pool/pool.ts`

Add to pool options union (~line 140):

```typescript
export type SQLitePoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions,
> =
  | SQLiteAlwaysNewPoolOptions<SQLiteConnectionType, ConnectionOptions>
  | SQLiteSingletonConnectionPoolOptions<SQLiteConnectionType, ConnectionOptions>
  | SQLiteAmbientConnectionPoolOptions<SQLiteConnectionType>
  | SQLiteDualPoolOptions<SQLiteConnectionType, ConnectionOptions>; // NEW
```

Update `toSqlitePoolOptions` function (lines 172-191):

```typescript
export const toSqlitePoolOptions = <
  SQLiteConnectionType extends AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions,
>(
  options: SQLitePoolFactoryOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLitePoolOptions<SQLiteConnectionType, ConnectionOptions> => {
  const { singleton, ...rest } = options;
  const isInMemory = isInMemoryDatabase(options);

  // In-memory databases MUST use singleton
  if (isInMemory) {
    return { ...rest, singleton: true } as SQLitePoolOptions<...>;
  }

  // File-based databases: dual pool by default, unless singleton explicitly requested
  if (singleton === true) {
    return { ...rest, singleton: true } as SQLitePoolOptions<...>;
  }

  // Default for file-based: dual pool
  return { ...rest, dual: true } as SQLitePoolOptions<...>;
};
```

Update `sqlitePool` factory (lines 193-223):

```typescript
export function sqlitePool<
  SQLiteConnectionType extends AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions,
>(
  options: SQLitePoolOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLitePool<SQLiteConnectionType> {
  const { driverType } = options;

  if (options.connection)
    return createAmbientConnectionPool<SQLiteConnectionType>({
      driverType,
      connection: options.connection,
    });

  if ('dual' in options && options.dual) {
    return sqliteDualConnectionPool(options);
  }

  if (options.singleton === true && options.sqliteConnectionFactory) {
    return createSingletonConnectionPool({
      driverType,
      getConnection: () =>
        options.sqliteConnectionFactory(options.connectionOptions),
    });
  }

  return createAlwaysNewConnectionPool({
    driverType,
    getConnection: () =>
      options.sqliteConnectionFactory!(options.connectionOptions!),
  });
}
```

---

## Verification Plan

### Phase 1: PRAGMA Configuration

```typescript
// Test: Query PRAGMA values after connection
const result = await pool.execute.query(SQL`PRAGMA journal_mode;`);
assert(result[0] === "wal");

const sync = await pool.execute.query(SQL`PRAGMA synchronous;`);
assert(sync[0] === 1); // NORMAL = 1

const fk = await pool.execute.query(SQL`PRAGMA foreign_keys;`);
assert(fk[0] === 1); // ON = 1

// Test: Connection string override
const pool2 = sqlitePool({
  connectionString: "file:test.db?synchronous=FULL&foreign_keys=off",
  // ...
});
const sync2 = await pool2.execute.query(SQL`PRAGMA synchronous;`);
assert(sync2[0] === 2); // FULL = 2
```

### Phase 2: BEGIN IMMEDIATE

```typescript
// Test: Lock acquired upfront
const pool = sqlitePool({ ... });
await pool.withTransaction(async (tx) => {
  // Lock should be acquired immediately, not on first write
  await tx.execute.query(SQL`SELECT 1;`); // Read
  await tx.execute.command(SQL`INSERT INTO test VALUES (1);`); // Write
  // Should not get SQLITE_BUSY here
});

// Test: DEFERRED mode still works
await pool.withTransaction({ mode: 'DEFERRED' }, async (tx) => {
  // ...
});
```

### Phase 3: Dual Pool

```typescript
// Test: Commands use writer, queries use reader
const dualPool = sqlitePool({
  dual: true,
  readerPoolSize: 4,
  // ...
});

// Performance test: Concurrent reads during write
const startWrite = dualPool.execute.command(SQL`
  INSERT INTO test SELECT * FROM large_table;
`);

// These should complete quickly (readers don't block on write)
const reads = Promise.all([
  dualPool.execute.query(SQL`SELECT COUNT(*) FROM test;`),
  dualPool.execute.query(SQL`SELECT * FROM test LIMIT 10;`),
  dualPool.execute.query(SQL`SELECT MAX(id) FROM test;`),
]);

await Promise.all([startWrite, reads]);
```

---

## Testing Strategy

### Unit Tests

1. **PRAGMA parsing**: Connection string → options object
2. **PRAGMA merging**: Defaults < connection string < code options
3. **Transaction mode**: BEGIN IMMEDIATE vs DEFERRED
4. **Pool routing**: Commands → writer, queries → reader

### Integration Tests

1. **PRAGMA application**: Verify values after connection
2. **Transaction locking**: Test busy_timeout works with BEGIN IMMEDIATE
3. **Dual pool concurrency**: Multiple readers during writes
4. **Connection limits**: Bounded pool respects max connections

### End-to-End Tests

1. **Load test**: Measure reads/writes per second with dual pool
2. **Stress test**: Concurrent transactions with BEGIN IMMEDIATE
3. **Lock contention**: Verify no SQLITE_BUSY with proper configuration

---

## Breaking Changes & Migration

### 🔴 Breaking: `foreign_keys=true` by default

**Impact:** Databases with invalid foreign key constraints will fail.

**Migration:**

```typescript
// Opt-out if needed
const pool = sqlitePool({
  fileName: "mydb.sqlite",
  pragmaOptions: {
    foreign_keys: false,
  },
});

// Or via connection string
const pool = sqlitePool({
  connectionString: "file:mydb.sqlite?foreign_keys=off",
});
```

**Check constraints first:**

```sql
PRAGMA foreign_key_check;
```

### 🔴 Breaking: Dual pool default for file-based databases

**Impact:** File-based databases now create multiple connections (1 writer + N readers).

**Migration** (opt-out if needed):

```typescript
// Force singleton pool (single connection)
const pool = sqlitePool({
  fileName: "mydb.sqlite",
  singleton: true,
});
```

**Memory Impact:** Uses max(4, numCPU) + 1 connections instead of 1.

### 🟡 Behavior Change: `BEGIN IMMEDIATE` by default

**Impact:** Locks acquired earlier in transaction lifecycle.

**Migration:**

```typescript
// Use DEFERRED if needed (not recommended)
await pool.withTransaction({ mode: "DEFERRED" }, async () => {
  // ...
});
```

### 🟡 Removed: Per-query `timeoutMs` option

**Impact:** `timeoutMs` in query options no longer works.

**Migration:** Set at connection level:

```typescript
const pool = sqlitePool({
  // ...
  pragmaOptions: {
    busy_timeout: 10000, // 10 seconds
  },
});
```

---

## Appendix: Architecture Rationale

### Why BEGIN IMMEDIATE?

SQLite's default `BEGIN DEFERRED` transaction mode creates a fundamental problem:

1. Transaction starts in read-only mode
2. Lock acquisition postponed until first write
3. When upgrading read → write lock: **busy_timeout is ignored**, immediate SQLITE_BUSY error
4. Result: "database is locked" errors despite setting busy_timeout

SQLite enforces serializable isolation. Allowing a transaction to wait during upgrade could create anomalies. `BEGIN IMMEDIATE` solves this by acquiring write lock upfront, before any statements execute, so busy_timeout is respected during lock acquisition.

**Trade-off:** Acquires write lock even if transaction only reads. But this is better than unpredictable SQLITE_BUSY errors.

### Why Dual Pool?

SQLite's WAL mode enables **unlimited concurrent readers during writes**. The traditional "one connection" approach doesn't exploit this.

**Architecture:**
- **Writer pool:** 1 connection (serializes writes, prevents write-write conflicts - SQLite limitation)
- **Reader pool:** max(4, numCPU) connections (exploits WAL's concurrency model)
- **Routes:** commands → writer, queries → reader

**Expected throughput** (from article benchmarks):
- Before: ~8,300 writes/sec
- After: ~8,300 writes/sec + ~168,000 reads/sec concurrently

**Memory trade-off:** Fixed overhead (9 connections on 8-CPU machine ≈ 9MB) for dramatically better read throughput.

### Why Connection-Level busy_timeout?

Per-query busy_timeout requires issuing `PRAGMA busy_timeout = N;` before every operation. This:
- Adds roundtrip overhead
- Can be overridden accidentally
- Doesn't match how SQLite expects to be configured

Connection-level configuration (set once on connect) is standard for all major databases.

### Layer Separation: Core vs Driver

**Core Layer** (shared across all drivers):
- PRAGMA types and defaults
- Connection string parsing
- PRAGMA merge logic
- Transaction modes (BEGIN IMMEDIATE)
- Pool strategies (singleton, dual)

**Driver Layer** (specific to sqlite3, node:sqlite, etc.):
- How to execute PRAGMA statements (db.run vs D1 API)
- Connection creation
- Driver-specific APIs and limitations

**Benefit:** Future SQLite drivers automatically get 90% of optimizations with ~50-100 lines of driver code.

### PRAGMA Configuration Hierarchy

```
Defaults → Connection String → Code Options
(lowest priority)            (highest priority)
```

**Rationale:**
1. **Defaults:** Server-optimized baseline (article recommendations)
2. **Connection String:** Infrastructure-level config (deployment, environment)
3. **Code Options:** Application-level overrides (runtime, feature flags)

This pattern matches PostgreSQL, MySQL, and other databases. Connection strings are parsed once at pool creation, not per-connection.

### Pool Architecture: Three-Tier Strategy

1. **In-Memory:** Singleton (data is connection-local, cannot be shared)
2. **File-Based Single-User:** Singleton (opt-in via `singleton: true`) - CLI tools, development
3. **File-Based Multi-User:** Dual Pool (default) - Servers, production

**Why not always-new by default?** Always-new creates connection churn. Each query opens connection, applies PRAGMAs, executes, closes. This is expensive and doesn't exploit WAL concurrency.

### Bounded Pool Design

**Semaphore-based pool pattern:**
- If available connection exists, reuse it
- If under max, create new
- If at max, queue request until connection available

**Key invariant:** `active_connections = in_use + available <= max`

Simple, correct, matches existing pool patterns. Idle connection cleanup can be added later if needed.

### Dual Pool Routing

Dumbo separates operations:
- `query`, `batchQuery` → Reader pool (can run concurrently)
- `command`, `batchCommand` → Writer pool (must be serialized)
- `withTransaction` → Writer pool (safe default, transactions may contain writes)

**Future optimization:** Add `readOnly: true` flag to route read-only transactions to reader pool.

### WAL Mode Persistence

WAL mode is **persistent at database file level**, not connection level. Once enabled, stays enabled forever (until explicitly disabled). Creates `.db-wal` and `.db-shm` files alongside database.

Current implementation sets it on every connection - harmless but redundant. Research shows calling PRAGMA on already-WAL database is near-zero overhead. Follows better-sqlite3 pattern.

### Alternative Approaches Considered

**Per-Connection Pool** - Let users create multiple pools, manually route operations.
- Rejected: Too complex, error-prone. Dual pool does this automatically.

**Thread Pool Instead of Connection Pool** - Single connection, worker threads execute operations.
- Rejected: SQLite connections aren't thread-safe. Would need mutex, defeating concurrency.

**Connection String-Only Configuration** - No code options, everything via connection string.
- Rejected: Not TypeScript-friendly, no autocomplete, hard to validate.

**EXCLUSIVE Transactions by Default** - Use BEGIN EXCLUSIVE instead of BEGIN IMMEDIATE.
- Rejected: Too aggressive, blocks all readers. IMMEDIATE is the sweet spot.

### Integration with Pongo

**Pongo Context:** MongoDB alternative on relational DBs. Uses Dumbo for connection management.

**Impact of Changes:**
1. **Dual pool:** Pongo read queries become dramatically faster under concurrency
2. **BEGIN IMMEDIATE:** Pongo write operations stop getting SQLITE_BUSY errors
3. **PRAGMAs:** Better defaults = better out-of-box performance

**No Pongo Changes Required:** All changes are at Dumbo level, Pongo automatically benefits.

### Testing Philosophy

**Principle:** Test behavior, not implementation.

Use real SQLite database (`:memory:` for speed), not mocks.

**Test Hierarchy:**
1. **Unit:** Pure logic (PRAGMA parsing, option merging)
2. **Integration:** Real database, single operation
3. **E2E:** Real database, full workloads

**Critical Tests:**
- Lock contention: Concurrent writes with BEGIN IMMEDIATE
- Pool routing: Verify commands go to writer, queries to reader
- Connection limits: Bounded pool respects max
- PRAGMA application: Query database to verify settings applied

---

## Research Sources

- [SQLite for Servers](https://kerkour.com/sqlite-for-servers) - Server configuration best practices
- [What to do about SQLite BUSY errors](https://lobste.rs/s/yapvon/what_do_about_sqlite_busy_errors_despite) - BEGIN IMMEDIATE solution
- [Enabling WAL mode](https://til.simonwillison.net/sqlite/enabling-wal-mode) - WAL persistence behavior
- [Database locked despite timeout](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/) - Transaction upgrade issues
- [SQLite PRAGMA documentation](https://www.sqlite.org/pragma.html) - Official PRAGMA reference
- [better-sqlite3 performance docs](https://github.com/wiselibs/better-sqlite3/blob/master/docs/performance.md) - WAL mode and checkpointing
