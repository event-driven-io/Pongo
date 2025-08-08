# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pongo** is a MongoDB-compatible API that translates MongoDB operations to native PostgreSQL queries using JSONB storage. It provides strong ACID consistency while maintaining MongoDB's familiar syntax.

### Core Concept

Pongo treats PostgreSQL as a Document Database by leveraging JSONB support. MongoDB API calls are translated to SQL queries that operate on tables with this structure:

```sql
CREATE TABLE "collection_name" (
    _id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    _version BIGINT NOT NULL DEFAULT 1,
    _partition TEXT NOT NULL DEFAULT 'png_global',
    _archived BOOLEAN NOT NULL DEFAULT FALSE,
    _created TIMESTAMPTZ NOT NULL DEFAULT now(),
    _updated TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

## Architecture

**Monorepo Structure**: TypeScript monorepo with two main packages using NPM workspaces.

### Core Packages

**`@event-driven-io/dumbo`** (`src/packages/dumbo/`)

- Low-level database abstraction layer
- Connection management, transactions, and query execution
- Database-agnostic interfaces with PostgreSQL/SQLite implementations
- SQL query building and formatting

**`@event-driven-io/pongo`** (`src/packages/pongo/`)

- MongoDB-compatible API layer
- Query translation from MongoDB syntax to SQL
- Collection operations (find, insert, update, delete)
- CLI tools for migrations and database management
- MongoDB driver shim for drop-in compatibility

### Key Architecture Layers

**Database Abstraction**:

- `dumbo/src/core/` - Database-agnostic interfaces
- `dumbo/src/storage/postgresql/` - PostgreSQL implementations
- `dumbo/src/storage/sqlite/` - SQLite implementations

**Query Translation Pipeline**:

- MongoDB query → `pongo/src/storage/*/sqlBuilder/` → SQL → Database execution
- Filter operations: `sqlBuilder/filter/queryOperators.ts`
- Update operations: `sqlBuilder/update/`

## Development Commands

**⚠️ Working Directory**: All commands must be run from the `src/` directory, not the project root.

```bash
cd src
```

### Building

```bash
npm run build              # Full build (TypeScript + bundling)
npm run build:ts           # TypeScript compilation only
npm run build:ts:watch     # TypeScript watch mode
npm run build:dumbo        # Build dumbo package only
npm run build:pongo        # Build pongo package only
```

### Testing

**Test Categories**:

- `*.unit.spec.ts` - Unit tests (no external dependencies)
- `*.int.spec.ts` - Integration tests (require database)
- `*.e2e.spec.ts` - End-to-end tests (full workflows)

**All Tests**:

```bash
npm run test                    # All tests (unit + int + e2e)
npm run test:postgresql         # PostgreSQL-only tests
npm run test:sqlite            # SQLite-only tests
```

**By Test Type**:

```bash
npm run test:unit              # Unit tests
npm run test:int               # Integration tests
npm run test:e2e               # End-to-end tests
```

**Database-Specific Tests**:

```bash
npm run test:unit:postgresql   # PostgreSQL unit tests
npm run test:int:postgresql    # PostgreSQL integration tests
npm run test:unit:sqlite       # SQLite unit tests
npm run test:int:sqlite        # SQLite integration tests
```

**Watch Mode**:

```bash
npm run test:watch             # Watch all test types
npm run test:unit:watch        # Watch unit tests only
```

**Single Test File**:

```bash
npm run test:file path/to/test.spec.ts
```

### Linting and Formatting

```bash
npm run lint                   # Check ESLint + Prettier
npm run fix                    # Auto-fix all issues
npm run lint:eslint           # ESLint only
npm run fix:prettier          # Fix Prettier only
```

### Documentation

```bash
npm run docs:dev              # Start VitePress dev server
npm run docs:build            # Build documentation
npm run docs:preview          # Preview built docs
```

### CLI Development

```bash
npm run cli:migrate:dryRun     # Test migration dry run
npm run cli:sql:print          # Print generated SQL
npm run cli:config:generate    # Generate config file
```

## Testing Strategy

**Database Testing**: Tests run against both PostgreSQL and SQLite using TestContainers for isolated database instances during integration tests.

**Test Organization**: Tests are organized by database in subdirectories (`postgresql/`, `sqlite/`) with generic tests applying to both databases.

**Key Testing Files**:

- `src/packages/pongo/src/e2e/compatibilityTest.e2e.spec.ts` - MongoDB compatibility tests
- Database-specific integration tests in respective `postgresql/`/`sqlite/` subdirectories

## Code Patterns

### TypeScript Configuration

- **Strict Mode**: Full TypeScript strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- **Module System**: ESNext modules with dual ESM/CommonJS output
- **Monorepo**: Uses TypeScript project references and workspace path mapping

### Database Integration Patterns

- Always use connection pools, not direct connections
- Database-specific implementations extend common interfaces from `dumbo/src/core/`
- SQL queries are parameterized to prevent injection attacks

### Query Translation Patterns

- MongoDB operators are mapped in `queryOperators.ts` files
- Complex nested queries use PostgreSQL's `jsonb_path_exists()` function
- Update operations leverage PostgreSQL's `jsonb_set()` and similar functions

## Important Entry Points

**Main APIs**:

- `src/packages/pongo/src/index.ts` - Primary Pongo API
- `src/packages/pongo/src/shim.ts` - MongoDB driver replacement
- `src/packages/pongo/src/cli.ts` - CLI application
- `src/packages/dumbo/src/index.ts` - Database abstraction layer

**Core Implementation**:

- `src/packages/pongo/src/core/pongoClient.ts` - Main client
- `src/packages/pongo/src/core/collection/pongoCollection.ts` - Collection operations
- `src/packages/pongo/src/storage/*/sqlBuilder/` - Query translation logic

## Development Workflow

**When Adding Database Features**:

1. Add interface in `dumbo/src/core/`
2. Implement for PostgreSQL in `dumbo/src/storage/postgresql/`
3. Implement for SQLite in `dumbo/src/storage/sqlite/`
4. Add tests for both databases
5. Update corresponding Pongo layer if needed

**When Adding MongoDB Compatibility**:

1. Add query translation in `pongo/src/storage/*/sqlBuilder/`
2. Implement in `pongoCollection.ts`
3. Add compatibility tests in `e2e/compatibilityTest.e2e.spec.ts`
4. Test against both PostgreSQL and SQLite

**Testing Requirements**:

- All features must work with both PostgreSQL and SQLite
- Integration tests automatically handle database setup via TestContainers
- Use database-specific test scripts when debugging database-specific issues

## Detailed Architecture Knowledge

### Connection Management Architecture

**Location**: `dumbo/src/core/connections/connection.ts`

**Key Pattern - Lazy Singleton Connections**:

```typescript
// Proper lazy singleton pattern for connection caching
let client: DbClient | null = null;
let connectPromise: Promise<DbClient> | null = null;

const getClient = async () => {
  if (client) return client;
  if (!connectPromise) {
    connectPromise = connect().then((c) => {
      client = c;
      return c;
    });
  }
  return connectPromise;
};
```

**Connection Types**:

- `CreateConnectionOptions<Connector, DbClient>` - Core connection configuration
- `Connection<Connector, DbClient>` - Connection interface with transaction support
- `ConnectionFactory<ConnectionType>` - Factory pattern for connection management

**Database-Specific Connection Implementations**:

- **PostgreSQL**: `dumbo/src/storage/postgresql/pg/connections/`
  - Pool connections: `nodePostgresNativePool()`, `nodePostgresAmbientNativePool()`
  - Client connections: `nodePostgresClientPool()`, `nodePostgresAmbientClientPool()`
- **SQLite**: `dumbo/src/storage/sqlite/core/connections/`
  - Singleton pools: `sqliteSingletonClientPool()`
  - Always-new pools: `sqliteAlwaysNewClientPool()`
  - Ambient pools: `sqliteAmbientClientPool()`

### SQL Formatting Architecture

**Location**: `dumbo/src/core/sql/`

**Formatter Registration Pattern**:

```typescript
import { registerFormatter } from "@event-driven-io/dumbo";
import { pgFormatter } from "@event-driven-io/dumbo/pg";
import { sqliteFormatter } from "@event-driven-io/dumbo/sqlite3";

// Auto-registered when imported
const formatter = getFormatter("PostgreSQL"); // or 'SQLite'
```

**SQL Template Literals**:

```typescript
import { SQL } from "@event-driven-io/dumbo";

// Automatic type detection and formatting
const query = SQL`SELECT * FROM ${identifier("users")} WHERE id = ${literal(
  userId
)}`;

// Custom formatting
const formatted = SQL.format(query, pgFormatter);
```

### Query Translation Architecture

**MongoDB → SQL Translation Pipeline**:

1. **Input**: MongoDB query syntax
2. **Parser**: `pongo/src/storage/*/sqlBuilder/`
3. **Operators**: `sqlBuilder/filter/queryOperators.ts`
4. **Output**: Native SQL for PostgreSQL/SQLite

**Key Translation Files**:

- **Filter Operations**: `queryOperators.ts` - `$eq`, `$ne`, `$in`, `$gt`, etc.
- **Update Operations**: `sqlBuilder/update/` - `$set`, `$unset`, `$push`, etc.
- **Aggregation**: Complex pipeline operations

### Testing Architecture

**Test File Naming Convention**:

- `*.unit.spec.ts` - Pure unit tests, no external dependencies
- `*.int.spec.ts` - Integration tests with database connections
- `*.e2e.spec.ts` - End-to-end workflow tests
- `*.generic.spec.ts` - Database-agnostic test suites

**Test Organization Structure**:

```
packages/
├── dumbo/src/
│   ├── core/ - Generic tests
│   └── storage/
│       ├── postgresql/pg/ - PostgreSQL-specific tests
│       └── sqlite/sqlite3/ - SQLite-specific tests
└── pongo/src/
    ├── e2e/compatibilityTest.e2e.spec.ts - MongoDB compatibility
    └── storage/
        ├── postgresql/ - PostgreSQL Pongo tests
        └── sqlite/ - SQLite Pongo tests
```

**Test Utilities**:

- **TestContainers**: Automatic database setup/teardown for integration tests
- **Database Fixtures**: Reusable test data and schemas
- **Mock Formatters**: For unit testing SQL generation without database

### Code Quality Standards

**TypeScript Configuration**:

- **Strict Mode**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- **Module System**: ESNext with dual ESM/CommonJS builds
- **Path Mapping**: Workspace-relative imports via `tsconfig.json`

**ESLint Rules**:

- `@typescript-eslint/no-explicit-any` - Avoid `any` types
- `@typescript-eslint/no-unsafe-*` - Unsafe type operations
- `@typescript-eslint/require-await` - Async functions must await
- `prettier/prettier` - Code formatting consistency

**Code Patterns to Follow**:

```typescript
// Correct: Proper error handling
try {
  const result = await connection.execute.query(SQL`SELECT * FROM users`);
  return result.rows;
} catch (error) {
  logger.error("Query failed", { error });
  throw error;
}

// Correct: Type-safe database operations
interface User extends QueryResultRow {
  id: string;
  name: string;
}
const users = await connection.execute.query<User>(
  SQL`SELECT id, name FROM users`
);

// Correct: Parameterized queries prevent SQL injection
const user = await connection.execute.query(
  SQL`SELECT * FROM users WHERE id = ${literal(userId)}`
);
```

### Package Structure Deep Dive

**Export Strategy**:

```json
// dumbo/package.json exports
{
  ".": "./dist/index.js",
  "./pg": "./dist/storage/postgresql/index.js",
  "./sqlite3": "./dist/storage/sqlite/index.js"
}
```

**Import Patterns**:

```typescript
// Core dumbo
import { SQL, createConnection } from "@event-driven-io/dumbo";

// PostgreSQL-specific
import { pgFormatter, nodePostgresPool } from "@event-driven-io/dumbo/pg";

// SQLite-specific
import { sqliteFormatter, sqlitePool } from "@event-driven-io/dumbo/sqlite3";

// Pongo (MongoDB-compatible layer)
import { pongoClient, PongoDb } from "@event-driven-io/pongo";
```

### Performance Considerations

**Connection Pooling**:

- Always use connection pools, never direct connections
- PostgreSQL: Native pool with advisory locks for migrations
- SQLite: Singleton pattern for file databases, always-new for tests

**Query Optimization**:

- Use JSONB indexes for frequently queried fields
- Leverage PostgreSQL's `jsonb_path_exists()` for complex nested queries
- SQLite uses JSON1 extension for document operations

**Memory Management**:

- Connections are lazily created and cached as singletons
- Proper cleanup in test teardown to prevent memory leaks
- Stream large result sets when possible

## Troubleshooting Common Issues

**Connection Issues**:

- Ensure `connect()` is only called once per connection instance
- Use proper connection factory patterns
- Check TestContainer setup for integration tests

**SQL Formatter Issues**:

- Import database-specific formatters: `@event-driven-io/dumbo/pg`
- Register custom formatters before use: `registerFormatter()`
- Use proper connector types: `PostgreSQL:pg`, `SQLite:sqlite3`

**Test Issues**:

- Run from `src/` directory, not project root
- Use database-specific test commands for debugging
- Check TestContainer logs for integration test failures

**Build Issues**:

- Run TypeScript compilation: `npm run build:ts`
- Fix linting: `npm run fix`
- Check workspace dependencies are properly linked

## Important Notes

- ALWAYS use the IDE diagnostics tool to check all the files that are not commited remotely.
- ALWAYS perform a git log and see previous commits when tests fail. You need to look at `origin/main` and `origin/current_branch` to see why things were passing before any current changes. It's safe to assume that what's on git is working typically since every dev runs commit hooks and we have CI/CD checks.
- DO NOT EVER js with ts in my typsecript. Don't import .js files in my TS files. JS is a concern for the dist dir only
- You must not add Debug files, just add new tests when needed
