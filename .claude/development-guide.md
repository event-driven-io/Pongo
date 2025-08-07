# Development Guide

## Prerequisites

- Node.js 18+ with NPM workspaces support
- TypeScript 5.0+
- Docker (for integration tests with TestContainers)
- PostgreSQL (for production database testing)

## Setup

```bash
# Clone and setup
git clone <repo>
cd Pongo/src  # ⚠️ Always work from src/ directory

# Install dependencies
npm install

# Initial build
npm run build
```

## Development Commands

### Building

```bash
# Full build (TypeScript + bundling)
npm run build

# TypeScript compilation only
npm run build:ts

# Watch mode for development
npm run build:ts:watch

# Package-specific builds
npm run build:dumbo        # Database layer only
npm run build:pongo        # MongoDB API layer only
```

### Testing

#### Test Categories
- `*.unit.spec.ts` - Pure unit tests, no external dependencies
- `*.int.spec.ts` - Integration tests requiring database connections
- `*.e2e.spec.ts` - End-to-end workflow tests

#### Test Commands
```bash
# All tests
npm run test                    # Unit + Integration + E2E
npm run test:unit              # Unit tests only
npm run test:int               # Integration tests only  
npm run test:e2e               # End-to-end tests only

# Database-specific testing
npm run test:postgresql        # PostgreSQL tests only
npm run test:sqlite           # SQLite tests only
npm run test:unit:postgresql  # PostgreSQL unit tests
npm run test:int:postgresql   # PostgreSQL integration tests
npm run test:unit:sqlite      # SQLite unit tests
npm run test:int:sqlite       # SQLite integration tests

# Development workflows
npm run test:watch            # Watch mode for all tests
npm run test:unit:watch       # Watch mode for unit tests
npm run test:file path/to/test.spec.ts  # Single test file
```

### Code Quality

```bash
# Linting and formatting
npm run lint                   # Check ESLint + Prettier
npm run fix                    # Auto-fix all issues
npm run lint:eslint           # ESLint only
npm run fix:prettier          # Prettier only
npm run lint:prettier         # Check Prettier only
```

### Documentation

```bash
# VitePress documentation
npm run docs:dev              # Development server
npm run docs:build            # Build static site
npm run docs:preview          # Preview built docs
```

### CLI Development

```bash
# Pongo CLI commands
npm run cli:migrate:dryRun     # Test migration without applying
npm run cli:sql:print          # Debug generated SQL
npm run cli:config:generate    # Generate configuration file
```

## Workflow Patterns

### Adding New Database Features

1. **Core Interface** (`dumbo/src/core/`)
   ```typescript
   // Define database-agnostic interface
   export interface NewFeature {
     execute(): Promise<Result>;
   }
   ```

2. **PostgreSQL Implementation** (`dumbo/src/storage/postgresql/`)
   ```typescript
   export const pgNewFeature: NewFeature = {
     execute: async () => {
       // PostgreSQL-specific implementation
     }
   };
   ```

3. **SQLite Implementation** (`dumbo/src/storage/sqlite/`)
   ```typescript
   export const sqliteNewFeature: NewFeature = {
     execute: async () => {
       // SQLite-specific implementation
     }
   };
   ```

4. **Tests for Both Databases**
   ```typescript
   // Generic test
   void describe('NewFeature', () => {
     void it('should work with both databases', async () => {
       // Test logic that works with both
     });
   });
   ```

### Adding MongoDB Compatibility

1. **Query Translation** (`pongo/src/storage/*/sqlBuilder/`)
   ```typescript
   export const translateNewOperator = (operator: MongoOperator): SQL => {
     // Translate MongoDB syntax to SQL
     return SQL`SELECT * FROM table WHERE ${buildCondition(operator)}`;
   };
   ```

2. **Collection Integration** (`pongo/src/core/collection/pongoCollection.ts`)
   ```typescript
   public async newOperation(query: MongoQuery): Promise<Result[]> {
     const sql = this.sqlBuilder.translateQuery(query);
     return this.connection.execute.query(sql);
   }
   ```

3. **Compatibility Tests** (`pongo/src/e2e/compatibilityTest.e2e.spec.ts`)
   ```typescript
   void it('should support new MongoDB operation', async () => {
     const collection = db.collection('test');
     const result = await collection.newOperation({ /* mongo query */ });
     assert.deepStrictEqual(result, expectedResult);
   });
   ```

## Connection Management Patterns

### Proper Connection Setup
```typescript
// ✅ Correct: Use connection factories
const pool = nodePostgresPool({
  connectionString: process.env.DATABASE_URL,
});
const connection = await pool.connection();

// ✅ Correct: Lazy singleton pattern
const getClient = async () => {
  if (client) return client;
  if (!connectPromise) {
    connectPromise = connect().then(c => {
      client = c;
      return c;
    });
  }
  return connectPromise;
};

// ❌ Incorrect: Direct client creation
const client = new pg.Client(); // Don't do this
```

### SQL Query Patterns
```typescript
// ✅ Correct: Template literals with proper escaping
const userId = '123';
const query = SQL`SELECT * FROM users WHERE id = ${literal(userId)}`;

// ✅ Correct: Type-safe queries
interface User extends QueryResultRow {
  id: string;
  name: string;
}
const users = await connection.execute.query<User>(query);

// ❌ Incorrect: String concatenation (SQL injection risk)
const badQuery = `SELECT * FROM users WHERE id = '${userId}'`; // Don't do this
```

## Testing Patterns

### Unit Test Structure
```typescript
import assert from 'assert';
import { describe, it } from 'node:test';

void describe('Component', () => {
  void it('should behave correctly', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = processInput(input);
    
    // Assert
    assert.strictEqual(result, 'expected');
  });
});
```

### Integration Test with Database
```typescript
import { afterEach, beforeEach, describe, it } from 'node:test';
import { sqlitePool } from '@event-driven-io/dumbo/sqlite3';

void describe('Database Integration', () => {
  let pool: ConnectionPool;

  beforeEach(async () => {
    pool = sqlitePool({ 
      fileName: ':memory:',
      connector: 'SQLite:sqlite3' 
    });
  });

  afterEach(async () => {
    await pool.close();
  });

  void it('should perform database operation', async () => {
    const connection = await pool.connection();
    const result = await connection.execute.query(
      SQL`SELECT 1 as test`
    );
    assert.strictEqual(result.rows[0]?.test, 1);
  });
});
```

## Debugging

### Common Debug Commands
```bash
# TypeScript compilation errors
npm run build:ts

# Test a specific file
npm run test:file packages/dumbo/src/core/connections/connection.unit.spec.ts

# Database-specific debugging
npm run test:int:postgresql  # PostgreSQL integration issues
npm run test:int:sqlite     # SQLite integration issues

# SQL generation debugging
npm run cli:sql:print       # See generated SQL
```

### Environment Variables
```bash
# Database connections
export DATABASE_URL="postgresql://user:pass@localhost:5432/db"
export SQLITE_DB_PATH="./test.db"

# Debug logging
export DEBUG="pongo:*"          # Pongo debug logs
export DEBUG="dumbo:*"          # Dumbo debug logs
export LOG_LEVEL="debug"        # General logging
```

### IDE Integration

#### VS Code Settings
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "eslint.workingDirectories": ["src"],
  "typescript.preferences.includePackageJsonAutoImports": "off"
}
```

#### Recommended Extensions
- ESLint
- Prettier  
- TypeScript Importer
- Error Lens
- GitLens

## Performance Tips

### Development Speed
- Use `npm run build:ts:watch` for faster iterations
- Run `npm run test:unit:watch` during TDD
- Use database-specific test commands to isolate issues

### Build Optimization
- Run `npm run build:ts` before `npm run build` for faster bundling
- Use `npm run test:unit` first, then integration tests
- Leverage TypeScript project references for incremental builds