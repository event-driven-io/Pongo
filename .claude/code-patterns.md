# Code Patterns and Standards

## TypeScript Configuration

### Strict Mode Settings
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Module System
- **Target**: ESNext modules with dual ESM/CommonJS output
- **Import Style**: Relative imports for internal modules, package imports for external
- **Path Mapping**: Workspace-relative imports via `tsconfig.json`

### Branded Type Patterns
- **Public API**: Simple branded types hide internal complexity
- **Internal Structure**: Rich interfaces for implementation flexibility
- **Helper Functions**: Clean access to internal structure when needed
- **Intentional Divergence**: Type system and runtime can diverge for API design

```typescript
// ✅ Branded type with hidden internal structure
type SQL = string & { __brand: 'sql' };

// Internal rich structure
interface ParametrizedSQL {
  __brand: 'parametrized-sql';
  sql: string;
  params: unknown[];
}

// Helper for internal access
const asParametrizedSQL = (sql: SQL): ParametrizedSQL => 
  sql as unknown as ParametrizedSQL;
```

## Design Simplicity Principles

### Single Responsibility Functions
```typescript
// ✅ Parametrizer has ONE job - convert values to parameters
const parametrize = (strings: TemplateStringsArray, values: unknown[]) => {
  // Everything becomes parameter except nested SQL which gets flattened
  // Special value handling happens in formatters, not here
};
```

### Avoid Over-Engineering
- Don't handle special cases unless actually needed
- Move complexity to appropriate layer (formatters vs parametrizers)
- Keep each layer simple and focused on its single responsibility

**Example of keeping it simple:**
```typescript
// ✅ Simple and focused
if (isNestedSQL(value)) {
  flatten(value);  // Only exception: flatten nested SQL
} else {
  addParameter(value);  // Everything else becomes __P1__, __P2__ parameters
}
```

## Connection Management Patterns

### Lazy Singleton Pattern
**Problem**: Ensure `connect()` is only called once per connection, even with concurrent access.

**Solution**:
```typescript
// ✅ Correct: Thread-safe lazy singleton
export const createConnection = <Connector, DbClient>(options: CreateConnectionOptions) => {
  let client: DbClient | null = null;
  let connectPromise: Promise<DbClient> | null = null;

  const getClient = async () => {
    if (client) return client;
    if (!connectPromise) {
      connectPromise = options.connect().then((c) => {
        client = c;
        return c;
      });
    }
    return connectPromise;
  };

  return {
    open: getClient,
    close: () => client ? options.close(client) : Promise.resolve(),
    // ... other connection methods
  };
};
```

**Anti-Pattern**:
```typescript
// ❌ Incorrect: Race condition - multiple connects possible
let client: DbClient | null = null;
const getClient = async () => client ?? (client = await connect());
```

### Connection Factory Pattern
```typescript
// ✅ Correct: Use factories, not direct instantiation
const pool = nodePostgresPool({
  connectionString: process.env.DATABASE_URL,
  database: 'myapp'
});

const connection = await pool.connection();

// ❌ Incorrect: Direct client creation
const client = new pg.Client(connectionString); // Avoid this
```

## SQL Query Patterns

### Template Literal Queries
```typescript
import { SQL, literal, identifier } from '@event-driven-io/dumbo';

// ✅ Correct: Template literals with proper escaping
const findUsers = (minAge: number, status: string) => 
  SQL`
    SELECT ${identifier('id')}, ${identifier('name')} 
    FROM ${identifier('users')} 
    WHERE age >= ${literal(minAge)} 
      AND status = ${literal(status)}
  `;

// ✅ Correct: Complex conditions
const complexQuery = SQL`
  SELECT data 
  FROM ${identifier(tableName)}
  WHERE ${buildWhereClause(filters)}
    AND created_at > ${literal(since)}
`;
```

**Anti-Patterns**:
```typescript
// ❌ SQL Injection Risk: String concatenation
const badQuery = `SELECT * FROM users WHERE id = '${userId}'`;

// ❌ Type Unsafe: Unescaped template literals  
const unsafeQuery = `SELECT * FROM ${tableName} WHERE id = ${userId}`;
```

### Type-Safe Database Operations
```typescript
// ✅ Correct: Define result interfaces
interface User extends QueryResultRow {
  id: string;
  name: string;
  email: string;
  created_at: Date;
}

// ✅ Correct: Type-safe query execution
const getUsers = async (connection: Connection): Promise<User[]> => {
  const result = await connection.execute.query<User>(
    SQL`SELECT id, name, email, created_at FROM users WHERE active = true`
  );
  return result.rows;
};

// ✅ Correct: Handle query results safely
const user = await connection.execute.query<User>(
  SQL`SELECT * FROM users WHERE id = ${literal(userId)}`
);

if (user.rows.length === 0) {
  throw new Error('User not found');
}

return user.rows[0]; // TypeScript knows this is User
```

## Error Handling Patterns

### Database Operation Error Handling
```typescript
// ✅ Correct: Comprehensive error handling
export const findUserById = async (
  connection: Connection,
  userId: string
): Promise<User | null> => {
  try {
    const result = await connection.execute.query<User>(
      SQL`SELECT * FROM users WHERE id = ${literal(userId)}`
    );
    
    return result.rows[0] ?? null;
  } catch (error) {
    // Log with context but don't expose internal details
    logger.error('Failed to find user', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    // Re-throw with appropriate error type
    if (error instanceof PostgresError && error.code === '23505') {
      throw new DuplicateUserError(userId);
    }
    
    throw new DatabaseError('Failed to retrieve user');
  }
};
```

### Transaction Error Handling
```typescript
// ✅ Correct: Transaction with proper rollback
export const transferData = async (connection: Connection, from: string, to: string) => {
  return connection.withTransaction(async (tx) => {
    try {
      await tx.execute.command(SQL`UPDATE accounts SET balance = balance - 100 WHERE id = ${literal(from)}`);
      await tx.execute.command(SQL`UPDATE accounts SET balance = balance + 100 WHERE id = ${literal(to)}`);
      
      // Transaction automatically commits on successful return
      return { success: true };
    } catch (error) {
      // Transaction automatically rolls back on throw
      logger.error('Transfer failed', { from, to, error });
      throw new TransferError('Transfer failed');
    }
  });
};
```

## MongoDB → SQL Translation Patterns

### Query Operator Translation
```typescript
// ✅ Correct: MongoDB operator mapping
export const buildWhereClause = (filter: MongoFilter): SQL => {
  const conditions: SQL[] = [];
  
  for (const [field, condition] of Object.entries(filter)) {
    if (typeof condition === 'object' && condition !== null) {
      // Handle operators like { age: { $gte: 18 } }
      for (const [operator, value] of Object.entries(condition)) {
        switch (operator) {
          case '$eq':
            conditions.push(SQL`data->>${literal(field)} = ${literal(value)}`);
            break;
          case '$gte':
            conditions.push(SQL`(data->>${literal(field)})::int >= ${literal(value)}`);
            break;
          case '$in':
            conditions.push(SQL`data->>${literal(field)} = ANY(${literal(value)})`);
            break;
          default:
            throw new UnsupportedOperatorError(operator);
        }
      }
    } else {
      // Handle simple equality: { status: "active" }
      conditions.push(SQL`data->>${literal(field)} = ${literal(condition)}`);
    }
  }
  
  return conditions.length > 0 
    ? SQL.merge(conditions, ' AND ')
    : SQL`TRUE`;
};
```

### Update Operation Translation
```typescript
// ✅ Correct: MongoDB update operator translation
export const buildUpdateClause = (update: MongoUpdate): SQL => {
  const setClauses: SQL[] = [];
  
  if (update.$set) {
    for (const [field, value] of Object.entries(update.$set)) {
      setClauses.push(
        SQL`data = jsonb_set(data, ${literal([field])}, ${literal(JSON.stringify(value))})`
      );
    }
  }
  
  if (update.$unset) {
    for (const field of Object.keys(update.$unset)) {
      setClauses.push(
        SQL`data = data - ${literal(field)}`
      );
    }
  }
  
  if (update.$inc) {
    for (const [field, increment] of Object.entries(update.$inc)) {
      setClauses.push(
        SQL`data = jsonb_set(
          data, 
          ${literal([field])}, 
          to_jsonb((COALESCE((data->>${literal(field)})::int, 0) + ${literal(increment)})::text)
        )`
      );
    }
  }
  
  return SQL.merge(setClauses, ', ');
};
```

## Testing Patterns

### Unit Test Structure
```typescript
// ✅ Correct: AAA pattern with descriptive names
void describe('UserService', () => {
  void describe('findUserById', () => {
    void it('should return user when user exists', async () => {
      // Arrange
      const mockConnection = createMockConnection();
      const userId = 'user123';
      const expectedUser = { id: userId, name: 'John Doe' };
      mockConnection.execute.query.mockResolvedValue({ rows: [expectedUser] });
      
      // Act
      const result = await findUserById(mockConnection, userId);
      
      // Assert
      assert.deepStrictEqual(result, expectedUser);
      assert.strictEqual(mockConnection.execute.query.callCount, 1);
    });

    void it('should return null when user does not exist', async () => {
      // Arrange
      const mockConnection = createMockConnection();
      const userId = 'nonexistent';
      mockConnection.execute.query.mockResolvedValue({ rows: [] });
      
      // Act
      const result = await findUserById(mockConnection, userId);
      
      // Assert
      assert.strictEqual(result, null);
    });
  });
});
```

### Integration Test Patterns
```typescript
// ✅ Correct: Database integration test with proper setup/teardown
void describe('UserRepository Integration', () => {
  let pool: ConnectionPool;
  let connection: Connection;

  beforeEach(async () => {
    pool = sqlitePool({ 
      fileName: ':memory:',
      connector: 'SQLite:sqlite3'
    });
    connection = await pool.connection();
    
    // Setup test schema
    await connection.execute.command(SQL`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL
      )
    `);
  });

  afterEach(async () => {
    await connection.close();
    await pool.close();
  });

  void it('should create and retrieve user', async () => {
    // Arrange
    const user = { id: 'test123', name: 'Test User', age: 30 };
    
    // Act - Create
    await connection.execute.command(SQL`
      INSERT INTO users (id, data) VALUES (${literal(user.id)}, ${literal(user)})
    `);
    
    // Act - Retrieve  
    const result = await connection.execute.query(SQL`
      SELECT data FROM users WHERE id = ${literal(user.id)}
    `);
    
    // Assert
    assert.strictEqual(result.rows.length, 1);
    assert.deepStrictEqual(result.rows[0]?.data, user);
  });
});
```

## Code Quality Standards

### ESLint Rules Adherence
```typescript
// ✅ Correct: Follow ESLint rules
export const processUser = async (user: User): Promise<ProcessedUser> => {
  // Explicit return types
  const result: ProcessedUser = {
    id: user.id,
    processedAt: new Date(),
  };
  
  // No unused variables (prefix with _ if needed)
  const _debugInfo = { originalUser: user };
  
  // Prefer const over let
  const processedData = await processUserData(user);
  result.data = processedData;
  
  return result;
};

// ❌ Incorrect: ESLint violations
export const badProcessUser = async (user: any) => { // any type
  let result = {}; // should be const, no type annotation
  var unused = 'test'; // var instead of const, unused variable
  return result; // implicit any return type
};
```

### Import/Export Patterns
```typescript
// ✅ Correct: Explicit named exports
export { createConnection } from './connection';
export { SQL, literal, identifier } from './sql';
export type { Connection, ConnectionPool } from './types';

// ✅ Correct: Barrel exports for clean APIs
// src/index.ts
export * from './core';
export * from './connections';
export type * from './types';

// ✅ Correct: Import patterns
import { SQL } from '@event-driven-io/dumbo';
import { pgFormatter } from '@event-driven-io/dumbo/pg';
import type { Connection } from '@event-driven-io/dumbo';

// ❌ Incorrect: Default export in library code
export default connection; // Prefer named exports
```

### Documentation Patterns
```typescript
/**
 * Creates a new database connection with lazy singleton pattern.
 * 
 * @param options - Connection configuration options
 * @returns Promise resolving to a Connection instance
 * 
 * @example
 * ```typescript
 * const connection = await createConnection({
 *   connector: 'PostgreSQL:pg',
 *   connect: () => pg.connect(connectionString),
 *   close: (client) => client.end()
 * });
 * ```
 */
export const createConnection = async <T>(
  options: ConnectionOptions<T>
): Promise<Connection<T>> => {
  // Implementation...
};
```

## Performance Patterns

### Connection Pool Management
```typescript
// ✅ Correct: Singleton connection pools
const connectionPool = (() => {
  let pool: ConnectionPool | null = null;
  
  return () => {
    if (!pool) {
      pool = createConnectionPool({
        maxConnections: 10,
        acquireTimeoutMs: 30000
      });
    }
    return pool;
  };
})();
```

### Query Optimization
```typescript
// ✅ Correct: Efficient JSONB queries
const findActiveUsersWithProfiles = (limit: number) => SQL`
  SELECT 
    u.data->>'id' as user_id,
    u.data->>'name' as name,
    p.data as profile
  FROM users u
  LEFT JOIN profiles p ON u.data->>'id' = p.data->>'userId'
  WHERE u.data->>'active' = 'true'
  ORDER BY u.created_at DESC
  LIMIT ${literal(limit)}
`;

// Consider adding indexes for performance:
// CREATE INDEX idx_users_active ON users USING gin ((data->>'active'));
// CREATE INDEX idx_users_created ON users (created_at);
```