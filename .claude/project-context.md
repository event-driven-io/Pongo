# Pongo Project Context

## Project Overview

**Pongo** is a MongoDB-compatible API that translates MongoDB operations to native PostgreSQL queries using JSONB storage, providing strong ACID consistency while maintaining MongoDB's familiar syntax.

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

### Monorepo Structure
TypeScript monorepo with two main packages using NPM workspaces:

```
src/
├── packages/
│   ├── dumbo/          # Database abstraction layer
│   └── pongo/          # MongoDB-compatible API layer
├── docs/               # VitePress documentation
└── samples/            # Example applications
```

### Core Packages

#### @event-driven-io/dumbo (`src/packages/dumbo/`)
**Database abstraction layer providing**:
- Connection management with lazy singleton patterns
- Transaction support with ACID guarantees
- Database-agnostic interfaces
- SQL query building and formatting
- Support for PostgreSQL and SQLite

**Key Components**:
- `src/core/` - Database-agnostic interfaces and utilities
- `src/storage/postgresql/` - PostgreSQL implementations
- `src/storage/sqlite/` - SQLite implementations

#### @event-driven-io/pongo (`src/packages/pongo/`)
**MongoDB-compatible API layer providing**:
- Query translation from MongoDB syntax to SQL
- Collection operations (find, insert, update, delete)
- CLI tools for migrations and database management
- MongoDB driver shim for drop-in compatibility

**Key Components**:
- `src/core/` - Main client and collection implementations
- `src/storage/*/sqlBuilder/` - Query translation logic
- `src/cli.ts` - Command-line interface
- `src/shim.ts` - MongoDB driver replacement

## Key Architecture Layers

### 1. Database Abstraction (Dumbo)
```
MongoDB Query → Dumbo Core Interfaces → Database-Specific Implementation
```

**Connection Management**: `dumbo/src/core/connections/`
- Lazy singleton connection pattern ensures `connect()` called only once
- Thread-safe concurrent connection handling
- Proper connection pooling for PostgreSQL and SQLite

**SQL Generation**: `dumbo/src/core/sql/`
- Template literal SQL with automatic escaping
- Database-specific formatters (PostgreSQL, SQLite)
- Type-safe parameter binding

### 2. Query Translation Pipeline (Pongo)
```
MongoDB Syntax → SQL Builder → Native SQL → Database Execution
```

**Translation Components**:
- `sqlBuilder/filter/queryOperators.ts` - MongoDB operators (`$eq`, `$ne`, `$in`, etc.)
- `sqlBuilder/update/` - Update operations (`$set`, `$unset`, `$push`, etc.)
- `sqlBuilder/aggregation/` - Aggregation pipeline operations

### 3. Database Support Matrix

| Feature | PostgreSQL | SQLite | Notes |
|---------|------------|--------|-------|
| JSONB Storage | ✅ Native | ✅ JSON1 Extension | PostgreSQL preferred for production |
| Transactions | ✅ Full ACID | ✅ Limited nesting | SQLite nested transactions need special handling |
| Connection Pooling | ✅ Native pools | ✅ Singleton pattern | Different strategies per database |
| Advanced Queries | ✅ `jsonb_path_exists()` | ✅ JSON functions | PostgreSQL has richer JSONB support |

## Package Export Strategy

### Dumbo Exports
```typescript
// Core functionality
import { SQL, createConnection } from '@event-driven-io/dumbo';

// PostgreSQL-specific
import { pgFormatter, nodePostgresPool } from '@event-driven-io/dumbo/pg';

// SQLite-specific  
import { sqliteFormatter, sqlitePool } from '@event-driven-io/dumbo/sqlite3';
```

### Pongo Exports
```typescript
// Main API
import { pongoClient, PongoDb, PongoCollection } from '@event-driven-io/pongo';

// MongoDB compatibility shim
import '@event-driven-io/pongo/shim'; // Drop-in replacement
```

## Development Environment

### Working Directory
⚠️ **Critical**: All commands must be run from the `src/` directory, not the project root.

```bash
cd src
npm run build    # ✅ Correct
```

### Key Dependencies
- **TypeScript**: Strict mode with `exactOptionalPropertyTypes`
- **ESLint**: Custom rules for type safety and code quality
- **Prettier**: Consistent code formatting
- **Node.js Test Runner**: Built-in testing framework
- **TestContainers**: Database integration testing

## MongoDB Compatibility

Pongo provides a high-fidelity MongoDB API implementation:

### Supported Operations
- **CRUD**: `find()`, `insertOne()`, `updateMany()`, `deleteOne()`, etc.
- **Aggregation**: Pipeline operations with `$match`, `$group`, `$sort`
- **Indexing**: Automatic JSONB indexes for frequently queried fields
- **Transactions**: Full ACID support via PostgreSQL/SQLite

### MongoDB → SQL Translation Examples
```javascript
// MongoDB query
db.users.find({ age: { $gte: 18 }, status: "active" })

// Generated SQL (PostgreSQL)
SELECT data FROM users 
WHERE (data->>'age')::int >= 18 
  AND data->>'status' = 'active'
```

## Performance Characteristics

### PostgreSQL (Production)
- **Strengths**: Rich JSONB support, advanced indexing, concurrent transactions
- **Use Case**: Production deployments, complex queries, high concurrency

### SQLite (Development/Testing)
- **Strengths**: Zero configuration, fast setup, embedded
- **Use Case**: Development, testing, embedded applications, CI/CD

### Connection Pooling Strategy
- **PostgreSQL**: Native connection pools with advisory locks for migrations
- **SQLite**: Singleton pattern for file databases, always-new for tests
- **Lazy Loading**: Connections created on-demand and cached as singletons