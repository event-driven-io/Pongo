# Testing Guide

## Testing Philosophy

Pongo follows a comprehensive testing strategy ensuring reliability across both PostgreSQL and SQLite databases with multiple test levels:

1. **Unit Tests** - Fast, isolated, no external dependencies
2. **Integration Tests** - Database interactions with TestContainers
3. **End-to-End Tests** - Complete workflow validation

## Test Organization

### File Naming Conventions

```
*.unit.spec.ts      # Pure unit tests
*.int.spec.ts       # Integration tests with databases
*.e2e.spec.ts       # End-to-end workflow tests
*.generic.spec.ts   # Database-agnostic test suites
```

### Directory Structure

```
packages/
├── dumbo/src/
│   ├── core/                           # Generic, database-agnostic tests
│   │   ├── sql/sql.unit.spec.ts       # SQL template literal tests
│   │   └── connections/connection.unit.spec.ts
│   └── storage/
│       ├── postgresql/pg/              # PostgreSQL-specific tests
│       │   ├── connections/connection.int.spec.ts
│       │   └── sql/formatter.unit.spec.ts
│       └── sqlite/sqlite3/             # SQLite-specific tests
│           ├── connections/connection.int.spec.ts
│           └── sql/formatter.unit.spec.ts
└── pongo/src/
    ├── e2e/
    │   └── compatibilityTest.e2e.spec.ts  # MongoDB API compatibility
    ├── core/
    │   └── collection/pongoCollection.unit.spec.ts
    └── storage/
        ├── postgresql/                 # PostgreSQL Pongo tests
        └── sqlite/                     # SQLite Pongo tests
```

## Test Categories

### Unit Tests (`*.unit.spec.ts`)

**Purpose**: Test individual functions/classes in isolation without external dependencies.

**Characteristics**:
- No database connections
- No file system access
- Fast execution (< 100ms per test)
- Mockable dependencies

**Example**:
```typescript
import assert from 'assert';
import { describe, it } from 'node:test';
import { SQL, formatSQL } from '../sql';

void describe('SQL Template Literals', () => {
  void it('should format literals correctly', () => {
    const userId = '123';
    const query = SQL`SELECT * FROM users WHERE id = ${userId}`;
    
    assert.strictEqual(
      formatSQL(query),
      "SELECT * FROM users WHERE id = '123'"
    );
  });
});
```

### Integration Tests (`*.int.spec.ts`)

**Purpose**: Test database interactions and cross-component integration.

**Characteristics**:
- Real database connections via TestContainers
- Test connection pooling, transactions, queries
- Slower execution (100ms - 5s per test)
- Database state setup/teardown

**Example**:
```typescript
import { afterEach, beforeEach, describe, it } from 'node:test';
import { sqlitePool } from '@event-driven-io/dumbo/sqlite3';
import { SQL } from '@event-driven-io/dumbo';

void describe('Connection Integration', () => {
  let pool: ConnectionPool;
  let connection: Connection;

  beforeEach(async () => {
    pool = sqlitePool({
      fileName: ':memory:',
      connector: 'SQLite:sqlite3'
    });
    connection = await pool.connection();
  });

  afterEach(async () => {
    await connection.close();
    await pool.close();
  });

  void it('should execute queries successfully', async () => {
    await connection.execute.command(
      SQL`CREATE TABLE test (id INTEGER, name TEXT)`
    );
    
    const result = await connection.execute.query(
      SQL`INSERT INTO test (id, name) VALUES (1, 'test') RETURNING *`
    );
    
    assert.strictEqual(result.rows[0]?.id, 1);
    assert.strictEqual(result.rows[0]?.name, 'test');
  });
});
```

### End-to-End Tests (`*.e2e.spec.ts`)

**Purpose**: Test complete workflows from MongoDB API to database storage.

**Characteristics**:
- Full Pongo client setup
- MongoDB API compatibility validation
- Real database backends
- Comprehensive workflow testing

**Example**:
```typescript
import { describe, it } from 'node:test';
import { pongoClient } from '@event-driven-io/pongo';

void describe('MongoDB Compatibility', () => {
  void it('should support MongoDB find operations', async () => {
    const client = pongoClient(connectionString);
    const db = client.db('test');
    const collection = db.collection('users');

    // Insert test data
    await collection.insertMany([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 }
    ]);

    // Test MongoDB-style query
    const results = await collection.find({ age: { $gte: 25 } }).toArray();
    
    assert.strictEqual(results.length, 2);
    assert.ok(results.some(u => u.name === 'Alice'));
    assert.ok(results.some(u => u.name === 'Bob'));
  });
});
```

## Database Testing Strategy

### TestContainers Integration

**Automatic Setup**: Tests automatically spin up isolated database instances.

```typescript
// PostgreSQL integration test
import { testcontainers } from 'testcontainers';

const postgresContainer = await new testcontainers.PostgreSqlContainer()
  .withDatabase('test')
  .withUsername('test')
  .withPassword('test')
  .start();

const connectionString = postgresContainer.getConnectionUri();
```

### Multi-Database Testing

**Pattern**: Write tests that run against both PostgreSQL and SQLite.

```typescript
const databases = [
  {
    name: 'PostgreSQL',
    connector: 'PostgreSQL:pg',
    setupPool: () => nodePostgresPool({ connectionString })
  },
  {
    name: 'SQLite',  
    connector: 'SQLite:sqlite3',
    setupPool: () => sqlitePool({ fileName: ':memory:' })
  }
];

databases.forEach(({ name, setupPool }) => {
  void describe(`${name} Database`, () => {
    let pool: ConnectionPool;
    
    beforeEach(async () => {
      pool = setupPool();
    });
    
    afterEach(async () => {
      await pool.close();
    });
    
    void it('should work with any database', async () => {
      const connection = await pool.connection();
      // Test logic that works with both databases
    });
  });
});
```

## Testing Best Practices

### Quality Gate Reality

**Complete Quality Checks Required**
```bash
# ALL must pass before marking step complete:
npm run fix       # Auto-fix all linting and formatting issues
npm run build:ts  # Clean TypeScript compilation  
npm run test      # ALL tests pass (not just unit tests)
```

**Don't mark steps complete with failing quality checks** - this leads to compound problems.

**Test Impact Assessment**
```bash
# Don't assume scope - run everything
npm run test     # May reveal 65+ failing tests from "small" change
```
Internal API changes can break many external tests. Test early, fail early, fix systematically.

### Comprehensive Test Definition

Write tests that define complete behavior:
```typescript
// ✅ Cover all scenarios in test suite
void describe('nested SQL template flattening', () => {
  void it('should flatten simple nested SQL', () => { /* ... */ });
  void it('should handle deeply nested SQL', () => { /* ... */ });
  void it('should handle multiple nested SQL with parameters', () => { /* ... */ });
});
```
**Comprehensive test suites (200+ lines) help catch design issues early and define exact behavior expectations.**

### Test Structure (AAA Pattern)

```typescript
void it('should describe the expected behavior', async () => {
  // Arrange - Set up test data and dependencies
  const input = { id: '123', name: 'test' };
  const mockService = createMockService();
  
  // Act - Execute the code under test
  const result = await serviceUnderTest.process(input);
  
  // Assert - Verify the expected outcome
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.data.name, 'test');
});
```

### Connection Management in Tests

```typescript
// ✅ Correct: Proper setup and teardown
void describe('Database Tests', () => {
  let pool: ConnectionPool;
  let connection: Connection;

  beforeEach(async () => {
    pool = createTestPool();
    connection = await pool.connection();
  });

  afterEach(async () => {
    await connection.close();
    await pool.close();
  });
});

// ❌ Incorrect: No cleanup
void describe('Bad Database Tests', () => {
  void it('creates connection without cleanup', async () => {
    const connection = await createConnection(); // Memory leak!
    // Test logic...
    // Missing: await connection.close();
  });
});
```

### SQL Formatter Testing

```typescript
// For unit tests requiring SQL formatting
import { pgFormatter } from '@event-driven-io/dumbo/pg';
import { registerFormatter } from '@event-driven-io/dumbo';
import { beforeEach } from 'node:test';

void describe('SQL Generation', () => {
  beforeEach(() => {
    // Register formatter for tests
    registerFormatter('PostgreSQL', pgFormatter);
  });
  
  void it('should generate correct SQL', () => {
    const query = SQL`SELECT * FROM users WHERE id = ${literal('123')}`;
    const formatted = formatSQL(query);
    assert.strictEqual(formatted, "SELECT * FROM users WHERE id = '123'");
  });
});
```

## Test Commands Reference

### Running Tests

```bash
# All tests
npm run test                    # Everything
npm run test:unit              # Unit tests only
npm run test:int               # Integration tests only
npm run test:e2e               # End-to-end tests only

# Database-specific
npm run test:postgresql        # All PostgreSQL tests
npm run test:sqlite           # All SQLite tests
npm run test:unit:postgresql  # PostgreSQL unit tests
npm run test:int:postgresql   # PostgreSQL integration tests
npm run test:unit:sqlite      # SQLite unit tests
npm run test:int:sqlite       # SQLite integration tests

# Development
npm run test:watch            # Watch all tests
npm run test:unit:watch       # Watch unit tests only
npm run test:file test.spec.ts # Single test file
```

### Debugging Test Failures

```bash
# Run specific test with verbose output
npm run test:file -- --verbose packages/path/to/test.spec.ts

# Database-specific debugging
npm run test:int:postgresql    # PostgreSQL integration issues
npm run test:int:sqlite       # SQLite integration issues

# Check test container logs
docker logs $(docker ps -q --filter "name=testcontainers")
```

## Test Data Management

### In-Memory Testing
```typescript
// SQLite in-memory for fast unit tests
const pool = sqlitePool({
  fileName: ':memory:',
  connector: 'SQLite:sqlite3'
});
```

### Test Fixtures
```typescript
// Reusable test data
export const TEST_USERS = [
  { id: '1', name: 'Alice', age: 30, active: true },
  { id: '2', name: 'Bob', age: 25, active: false }
];

export const setupTestData = async (collection: PongoCollection) => {
  await collection.insertMany(TEST_USERS);
};
```

### Database Isolation
```typescript
// Ensure test isolation
afterEach(async () => {
  // Clean up test data
  await connection.execute.command(SQL`TRUNCATE TABLE test_table`);
});
```

## Performance Testing Considerations

### Test Execution Speed
- **Unit tests**: < 100ms per test
- **Integration tests**: < 5s per test  
- **E2E tests**: < 30s per test

### Memory Management
```typescript
// Avoid memory leaks in test suites
afterEach(async () => {
  await connection.close();
  await pool.close();
  // Explicit cleanup for test data
});
```

### Concurrent Test Execution
- Tests run in parallel by default with Node.js test runner
- Use isolated database instances per test suite
- Avoid shared mutable state between tests