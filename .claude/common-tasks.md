# Common Development Tasks

## Quick Reference Commands

### Essential Development Workflow
```bash
# Always work from src/ directory
cd src

# Development cycle
npm run build:ts:watch    # Terminal 1: TypeScript compilation  
npm run test:unit:watch   # Terminal 2: Unit tests
npm run docs:dev          # Terminal 3: Documentation (optional)

# Before committing
npm run build            # Full build
npm run test            # All tests
npm run lint            # Check code quality
npm run fix             # Auto-fix issues
```

### Testing Workflow
```bash
# Run tests by type
npm run test:unit                    # Fast unit tests only
npm run test:int                     # Integration tests (slower)
npm run test:e2e                     # End-to-end tests (slowest)

# Run tests by database
npm run test:postgresql              # PostgreSQL tests
npm run test:sqlite                  # SQLite tests

# Debug specific test
npm run test:file packages/path/to/test.spec.ts

# Watch mode for TDD
npm run test:unit:watch
```

## Implementation Tasks

### Adding a New MongoDB Operator

**Example**: Adding `$regex` operator support

1. **Define the Operator Interface** (`pongo/src/types/`)
   ```typescript
   interface RegexOperator {
     $regex: string;
     $options?: string;
   }
   ```

2. **Implement SQL Translation** (`pongo/src/storage/postgresql/sqlBuilder/filter/`)
   ```typescript
   // queryOperators.ts
   export const translateRegexOperator = (
     field: string, 
     regex: string, 
     options?: string
   ): SQL => {
     const flags = options?.includes('i') ? '(?i)' : '';
     return SQL`data->>${literal(field)} ~ ${literal(flags + regex)}`;
   };
   ```

3. **Add SQLite Support** (`pongo/src/storage/sqlite/sqlBuilder/filter/`)
   ```typescript
   // queryOperators.ts (SQLite version)
   export const translateRegexOperator = (
     field: string,
     regex: string,
     options?: string
   ): SQL => {
     // SQLite uses REGEXP operator (requires extension)
     return SQL`data->>${literal(field)} REGEXP ${literal(regex)}`;
   };
   ```

4. **Write Unit Tests**
   ```typescript
   void describe('$regex operator', () => {
     void it('should translate regex query to SQL', () => {
       const query = { name: { $regex: '^John', $options: 'i' } };
       const sql = buildWhereClause(query);
       
       assert.strictEqual(
         formatSQL(sql),
         "data->>'name' ~ '(?i)^John'"
       );
     });
   });
   ```

5. **Add Integration Test**
   ```typescript
   void it('should find documents matching regex pattern', async () => {
     const collection = db.collection('users');
     await collection.insertMany([
       { name: 'John Doe' },
       { name: 'jane smith' },
       { name: 'JOHN SMITH' }
     ]);

     const results = await collection
       .find({ name: { $regex: '^john', $options: 'i' } })
       .toArray();
     
     assert.strictEqual(results.length, 2);
   });
   ```

6. **Update Documentation** (`docs/`)

### Adding a New Database Feature

**Example**: Adding support for database indexes

1. **Core Interface** (`dumbo/src/core/`)
   ```typescript
   export interface IndexManager {
     createIndex(name: string, definition: IndexDefinition): Promise<void>;
     dropIndex(name: string): Promise<void>;
     listIndexes(): Promise<IndexInfo[]>;
   }
   ```

2. **PostgreSQL Implementation** (`dumbo/src/storage/postgresql/`)
   ```typescript
   export class PostgreSQLIndexManager implements IndexManager {
     async createIndex(name: string, definition: IndexDefinition): Promise<void> {
       const sql = SQL`
         CREATE INDEX ${identifier(name)} 
         ON ${identifier(definition.table)} 
         USING GIN (${identifier(definition.column)})
       `;
       await this.connection.execute.command(sql);
     }
   }
   ```

3. **SQLite Implementation** (`dumbo/src/storage/sqlite/`)
   ```typescript
   export class SQLiteIndexManager implements IndexManager {
     async createIndex(name: string, definition: IndexDefinition): Promise<void> {
       const sql = SQL`
         CREATE INDEX ${identifier(name)}
         ON ${identifier(definition.table)}(${identifier(definition.column)})
       `;
       await this.connection.execute.command(sql);
     }
   }
   ```

4. **Add to Connection Interface**
   ```typescript
   export interface Connection {
     // ... existing properties
     indexes: IndexManager;
   }
   ```

### Adding a New Collection Operation

**Example**: Adding `findOneAndUpdate` operation

1. **Define Interface** (`pongo/src/core/collection/`)
   ```typescript
   export interface PongoCollection {
     findOneAndUpdate(
       filter: Filter,
       update: UpdateQuery,
       options?: FindOneAndUpdateOptions
     ): Promise<UpdateResult>;
   }
   ```

2. **Implement Operation** (`pongo/src/core/collection/pongoCollection.ts`)
   ```typescript
   async findOneAndUpdate(
     filter: Filter,
     update: UpdateQuery,
     options: FindOneAndUpdateOptions = {}
   ): Promise<UpdateResult> {
     const whereClause = this.sqlBuilder.buildWhereClause(filter);
     const updateClause = this.sqlBuilder.buildUpdateClause(update);
     
     const sql = SQL`
       UPDATE ${identifier(this.tableName)}
       SET ${updateClause}, _updated = now(), _version = _version + 1
       WHERE ${whereClause}
       RETURNING data, _version
       LIMIT 1
     `;

     const result = await this.connection.execute.query(sql);
     return {
       matchedCount: result.rowCount,
       modifiedCount: result.rowCount,
       value: result.rows[0]?.data ?? null
     };
   }
   ```

3. **Write Tests** (both unit and integration)

## Debugging Tasks

### Debug SQL Generation
```typescript
// Add debugging utility
export const debugSQL = (sql: SQL, formatter?: SQLFormatter): void => {
  const formatted = formatter ? SQL.format(sql, formatter) : sql.text;
  console.log('Generated SQL:', formatted);
  console.log('Parameters:', sql.values);
};

// Use in development
const query = buildSelectQuery(filters);
debugSQL(query, pgFormatter);
```

### Debug Connection Issues
```typescript
// Add connection debugging
export const debugConnection = async (connection: Connection): Promise<void> => {
  try {
    const result = await connection.execute.query(SQL`SELECT 1 as test`);
    console.log('Connection OK:', result.rows[0]);
  } catch (error) {
    console.error('Connection failed:', error);
  }
};
```

### Performance Profiling
```bash
# Profile test execution
time npm run test:unit

# Profile memory usage
node --inspect --max-old-space-size=4096 npm run test

# Profile specific operation
node --prof npm run test:file your-test.spec.ts
node --prof-process isolate-*.log > profiling.txt
```

## Database Tasks

### Setup Development Database
```bash
# PostgreSQL with Docker
docker run --name pongo-postgres \
  -e POSTGRES_DB=pongo_dev \
  -e POSTGRES_USER=pongo \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 -d postgres:15

# SQLite (no setup needed)
# Uses in-memory databases for tests
```

### Database Migrations
```bash
# Generate migration
npm run cli:migrate:generate --name="add_user_indexes"

# Apply migrations
npm run cli:migrate:up

# Rollback migration  
npm run cli:migrate:down

# Check migration status
npm run cli:migrate:status
```

### Schema Validation
```typescript
// Validate MongoDB → SQL schema mapping
const validateSchema = async (collection: PongoCollection) => {
  // Insert test document
  await collection.insertOne({
    id: 'test',
    nested: { field: 'value' },
    array: [1, 2, 3]
  });

  // Verify JSONB structure
  const result = await collection.findOne({ id: 'test' });
  console.log('Stored document:', result);
};
```

## CI/CD Tasks

### Pre-commit Checks
```bash
#!/bin/bash
# .git/hooks/pre-commit

cd src

# Build check
npm run build:ts || exit 1

# Test check
npm run test:unit || exit 1

# Lint check  
npm run lint || exit 1

echo "✅ Pre-commit checks passed"
```

### GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
        database: [postgresql, sqlite]
    
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        
    - run: cd src && npm ci
    - run: cd src && npm run build
    - run: cd src && npm run test:${{ matrix.database }}
```

## Release Tasks

### Version Bump
```bash
# Update version
npm version patch  # or minor, major
npm version prerelease --preid=alpha

# Build for release
npm run build

# Publish (if configured)
npm publish
```

### Documentation Update
```bash
# Update API documentation
npm run docs:build

# Generate changelog
npm run changelog

# Update README examples
npm run update-examples
```

## Maintenance Tasks

### Dependency Updates
```bash
# Check outdated packages
npm outdated

# Update dependencies
npm update

# Check security vulnerabilities
npm audit
npm audit fix
```

### Code Quality Maintenance
```bash
# Update ESLint rules
npm run lint -- --fix

# Check TypeScript strict mode compliance
npm run build:ts -- --strict

# Analyze bundle size
npm run build && npm run analyze
```

### Performance Monitoring
```bash
# Benchmark query performance
npm run benchmark

# Profile memory usage
npm run test -- --prof

# Check for memory leaks
npm run test:memory-leak
```