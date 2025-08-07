# Troubleshooting Guide

## Common Issues and Solutions

### Build Issues

#### TypeScript Compilation Errors
```bash
# Problem: TypeScript errors during build
npm run build:ts
# ❌ Error: Cannot find module or type declarations

# Solutions:
1. Check import paths are correct (relative vs absolute)
2. Verify tsconfig.json path mapping
3. Ensure all dependencies are installed: npm install
4. Check for circular dependencies
5. Verify export/import patterns match
```

**Common TypeScript Fixes**:
```typescript
// ✅ Correct: Relative imports for internal modules  
import { Connection } from '../connections';
import type { QueryResult } from '../query';

// ✅ Correct: Package imports for external modules
import { SQL } from '@event-driven-io/dumbo';

// ❌ Incorrect: Wrong import paths
import { Connection } from '@event-driven-io/dumbo/connections'; // Internal path
```

#### ESLint/Prettier Issues
```bash
# Problem: Linting failures
npm run lint
# ❌ Various ESLint and Prettier violations

# Solutions:
npm run fix              # Auto-fix most issues
npm run fix:prettier     # Fix formatting only
npm run lint:eslint      # Check specific ESLint rules

# Manual fixes for common issues:
# - Add explicit return types
# - Use const instead of let where possible  
# - Remove unused variables (prefix with _ if needed)
# - Fix async functions without await
```

**Common ESLint Fixes**:
```typescript
// ✅ Correct: Explicit types and proper async
export const getUser = async (id: string): Promise<User | null> => {
  const result = await connection.execute.query<User>(
    SQL`SELECT * FROM users WHERE id = ${literal(id)}`
  );
  return result.rows[0] ?? null;
};

// ❌ Incorrect: Missing types, no await
export const getUser = async (id) => {
  const result = connection.execute.query(`SELECT * FROM users WHERE id = '${id}'`);
  return result.rows[0];
};
```

### Connection Issues

#### Connection Pool Exhaustion
```bash
# Symptoms:
# - Tests hang or timeout
# - "Pool is exhausted" errors
# - Memory leaks in test runs

# Diagnosis:
npm run test:file your-test.spec.ts
# Check for hanging connections
```

**Solutions**:
```typescript
// ✅ Correct: Proper connection cleanup
void describe('Database Test', () => {
  let pool: ConnectionPool;
  let connection: Connection;

  beforeEach(async () => {
    pool = createTestPool();
    connection = await pool.connection();
  });

  afterEach(async () => {
    await connection.close();  // ✅ Clean up connection
    await pool.close();        // ✅ Clean up pool
  });
});

// ❌ Incorrect: Missing cleanup
void describe('Bad Test', () => {
  void it('creates connections without cleanup', async () => {
    const connection = await createConnection(); // ❌ Leaked connection
    // Test logic without cleanup
  });
});
```

#### Connection Factory Issues
```typescript
// ✅ Correct: Lazy singleton pattern
const createConnectionFactory = () => {
  let client: DbClient | null = null;
  let connectPromise: Promise<DbClient> | null = null;

  return async () => {
    if (client) return client;
    if (!connectPromise) {
      connectPromise = connect().then(c => {
        client = c;
        return c;
      });
    }
    return connectPromise;
  };
};

// ❌ Incorrect: Race condition
let client: DbClient | null = null;
const getClient = async () => client ?? (client = await connect()); // Multiple connects possible
```

### SQL Formatter Issues

#### "No SQL formatter registered" Error
```bash
# Error: No SQL formatter registered for dialect: PostgreSQL

# Solutions:
```

```typescript
// ✅ Solution 1: Import database-specific formatter
import '@event-driven-io/dumbo/pg';    // Auto-registers PostgreSQL formatter
import '@event-driven-io/dumbo/sqlite3'; // Auto-registers SQLite formatter

// ✅ Solution 2: Manual registration for tests
import { registerFormatter, pgFormatter } from '@event-driven-io/dumbo/pg';
beforeEach(() => {
  registerFormatter('PostgreSQL', pgFormatter);
});

// ✅ Solution 3: Use specific formatter directly
import { pgFormatter } from '@event-driven-io/dumbo/pg';
const formattedQuery = SQL.format(query, pgFormatter);
```

#### Connector Type Issues
```typescript
// ✅ Correct: Valid connector types
const pool = nodePostgresPool({
  connector: 'PostgreSQL:pg',  // ✅ Valid format: DatabaseType:Driver
});

const sqlitePool = createSQLitePool({
  connector: 'SQLite:sqlite3', // ✅ Valid format
});

// ❌ Incorrect: Invalid connector types  
const badPool = createPool({
  connector: 'postgres',       // ❌ Missing driver
  connector: 'test',          // ❌ Invalid format
});
```

### Testing Issues

#### Test Database Setup Problems
```bash
# Problem: Integration tests failing with database errors

# Check TestContainers status:
docker ps | grep testcontainers

# View container logs:
docker logs $(docker ps -q --filter "name=testcontainers")

# Clean up hanging containers:
docker kill $(docker ps -q --filter "name=testcontainers")
```

**Common Test Database Patterns**:
```typescript
// ✅ Correct: Isolated test database per test
void describe('Integration Test', () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    await testDb.migrate();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });
});

// ❌ Incorrect: Shared database state
let sharedConnection: Connection; // ❌ Tests will interfere with each other

void describe('Bad Integration Test', () => {
  void it('test 1', async () => {
    await sharedConnection.execute.command(SQL`INSERT INTO users ...`);
    // No cleanup - affects other tests
  });
});
```

#### Test File Organization Issues
```bash
# Problem: Tests not running or found in wrong locations

# Check test file naming:
find . -name "*.spec.ts" | head -10

# Correct naming patterns:
# ✅ *.unit.spec.ts  - Unit tests
# ✅ *.int.spec.ts   - Integration tests  
# ✅ *.e2e.spec.ts   - End-to-end tests

# ❌ *.test.ts       - Wrong suffix
# ❌ *Test.ts        - Wrong pattern
```

### Performance Issues

#### Slow Test Execution
```bash
# Diagnosis:
npm run test:unit       # Should be fast (< 5s total)
npm run test:int        # Slower but reasonable (< 30s total)

# If tests are slow:
# 1. Check for database connection leaks
# 2. Verify proper test isolation
# 3. Use in-memory SQLite for unit tests
# 4. Profile with --verbose flag
```

**Performance Optimizations**:
```typescript
// ✅ Fast: In-memory SQLite for unit tests
const fastTestPool = sqlitePool({
  fileName: ':memory:',
  connector: 'SQLite:sqlite3'
});

// ✅ Isolated: Fresh database per test
beforeEach(async () => {
  testDb = await createTestDatabase(); // New instance
});

// ❌ Slow: Shared file-based database
const slowPool = sqlitePool({
  fileName: './shared-test.db', // ❌ Shared state
  connector: 'SQLite:sqlite3'
});
```

#### Memory Leaks
```bash
# Symptoms:
# - Tests consume increasing memory
# - "JavaScript heap out of memory" errors
# - Hanging test processes

# Diagnosis:
node --max-old-space-size=4096 node_modules/.bin/npm run test

# Solutions:
# 1. Ensure all connections are closed
# 2. Clear test data between tests  
# 3. Use weak references for caches
# 4. Profile with Node.js inspector
```

### MongoDB Compatibility Issues

#### Query Translation Errors
```typescript
// Problem: MongoDB query doesn't translate to SQL correctly

// ✅ Debug: Print generated SQL
import { debugSQL } from './debug-utils';

const mongoQuery = { age: { $gte: 18 }, status: 'active' };
const sqlQuery = buildWhereClause(mongoQuery);
console.log('Generated SQL:', debugSQL(sqlQuery));

// ✅ Test: Verify translation step by step
void it('should translate MongoDB query correctly', () => {
  const mongoFilter = { age: { $gte: 18 } };
  const sqlWhere = buildWhereClause(mongoFilter);
  
  assert.strictEqual(
    formatSQL(sqlWhere),
    "(data->>'age')::int >= 18"
  );
});
```

#### Unsupported MongoDB Operations
```typescript
// ✅ Correct: Graceful degradation
export const translateQuery = (mongoQuery: MongoQuery): SQL => {
  try {
    return buildFullQuery(mongoQuery);
  } catch (error) {
    if (error instanceof UnsupportedOperatorError) {
      throw new NotImplementedError(
        `MongoDB operator '${error.operator}' not yet supported. ` +
        `Please use a different query or file a feature request.`
      );
    }
    throw error;
  }
};
```

## Debugging Commands

### Development Debugging
```bash
# TypeScript compilation
npm run build:ts               # Check for type errors

# Test specific components
npm run test:file path/to/test.spec.ts
npm run test:unit:watch        # Watch mode for development

# Database-specific debugging  
npm run test:int:postgresql    # PostgreSQL integration issues
npm run test:int:sqlite       # SQLite integration issues

# SQL generation debugging
npm run cli:sql:print         # See generated SQL output
```

### Environment Debugging
```bash
# Check Node.js version
node --version                # Should be 18+

# Check npm workspace setup
npm run build:dumbo           # Should build dumbo package
npm run build:pongo           # Should build pongo package

# Check Docker for TestContainers
docker --version              # Required for integration tests
docker ps                     # Check for hanging test containers
```

### Logging and Diagnostics
```bash
# Enable debug logging
export DEBUG="pongo:*"         # Pongo debug logs
export DEBUG="dumbo:*"         # Dumbo debug logs  
export LOG_LEVEL="debug"       # General application logging

# Run with verbose output
npm run test -- --verbose

# Memory usage monitoring
node --inspect --max-old-space-size=4096 npm run test
```

## Quick Fixes

### Reset Development Environment
```bash
# Clean build artifacts
rm -rf node_modules dist packages/*/dist

# Fresh install
npm install

# Rebuild everything
npm run build
```

### Reset Test Environment
```bash
# Kill hanging test processes
pkill -f "npm run test"

# Clean up test containers
docker kill $(docker ps -q --filter "name=testcontainers")
docker system prune -f

# Run clean test
npm run test:unit
```

### Fix Common File Issues
```bash
# Fix line endings (if developing on Windows)
find . -name "*.ts" -exec dos2unix {} \;

# Fix file permissions
find . -name "*.ts" -exec chmod 644 {} \;

# Check for circular dependencies
npx madge --circular --extensions ts ./src
```