# SQL Formatting in Dumbo - Current Implementation Analysis

## Overview

The current SQL formatting system in Dumbo generates string-based SQL queries from tagged template literals. This analysis covers the implementation and identifies areas for parametrization to improve performance and enable query plan reuse.

## Current Architecture

### Core Components

1. **SQL Template System** (`src/packages/dumbo/src/core/sql/`)
   - `SQL` tagged template literal function creates SQL objects
   - Two types: `RawSQL` (plain strings) and `DeferredSQL` (template with values)
   - Supports `identifier()`, `literal()`, and `raw()` helper functions

2. **Formatter Interface** (`src/packages/dumbo/src/core/sql/sqlFormatter.ts`)
   - `SQLFormatter` interface defines formatting methods
   - Registration system for database-specific formatters
   - Processes template literals by interpolating values as strings

3. **Database-Specific Formatters**
   - **PostgreSQL**: `src/packages/dumbo/src/storage/postgresql/core/sql/formatter/`
   - **SQLite**: `src/packages/dumbo/src/storage/sqlite/core/sql/formatter/`

### Current Execution Flow

```
SQL`SELECT * FROM users WHERE id = ${userId}` 
  → DeferredSQL object with strings/values
  → formatter.format(sql) 
  → String interpolation: "SELECT * FROM users WHERE id = 123"
  → client.query(sqlString)
```

### Key Files

- **Execution Entry Points:**
  - PostgreSQL: `src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts:94` - `pgFormatter.format(sqls[i]!)`
  - SQLite: `src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts:73` - `sqliteFormatter.format(sqls[i]!)`

- **Core SQL Types:**
  - `SQL`: Tagged template type
  - `DeferredSQL`: Template with placeholders
  - `RawSQL`: Plain string SQL

- **Value Types:**
  - `SQLIdentifier`: Column/table names
  - `SQLLiteral`: Escaped values  
  - `SQLRaw`: Unescaped strings

## Current Problems

### Performance Issues

1. **String Concatenation**: Each query generates a unique string, preventing query plan caching
2. **No Parameter Binding**: Values are embedded as literals, causing database to reparse/replan
3. **SQL Injection Risk**: While mitigated by escaping, parametrization is safer

### Database Behavior

- **PostgreSQL**: Query plans cached by exact string match - literal values prevent reuse
- **SQLite**: Similar issue with prepared statement benefits lost

## Current Formatter Implementations

### PostgreSQL Formatter (`pgFormat.ts`)
- Uses `pg-format` style escaping
- Quotes identifiers: `"table_name"`
- Escapes literals: `'escaped''value'`
- Handles JSON as `::jsonb` cast
- Complex array formatting with nested parentheses

### SQLite Formatter (`sqliteFormat.ts`) 
- Simpler quoting rules
- Boolean handling: `true` → `1`, `false` → `0`
- BigInt range checking for INTEGER type
- JSON stored as TEXT with quote escaping

## Testing Coverage

Comprehensive test suites exist for both formatters covering:
- Basic value type formatting
- SQL injection prevention
- Complex nested structures
- Database-specific features

## Refactoring Opportunities

The current system needs to transition from:

**Current**: `SQL → String → Database`

**Target**: `SQL → {query: string, params: any[]} → Database`

This would enable:
1. Query plan reuse through consistent query strings
2. Native parameter binding for better performance
3. Enhanced security through proper parameter separation
4. Reduced string processing overhead

## Database Parameter Styles Research

### Cross-Database Parameter Standards

**Key Finding**: No universal parameter standard exists across databases:

- **PostgreSQL**: `$1, $2, $3` (numbered placeholders) - node-postgres native
- **MySQL**: `?` (positional placeholders) - mysql2 standard  
- **SQLite**: `?` (positional) or `@name, :name, $name` (named) - better-sqlite3 supports both
- **SQL Server**: `@param1, @param2` (named with @ prefix)

### Parameter Binding Benefits

1. **Query Plan Reuse**: Consistent query structure enables database query plan caching
2. **Performance**: Database parses/plans once, executes multiple times with different parameters  
3. **Security**: Native parameter binding prevents SQL injection more effectively than escaping
4. **Memory**: Reduced string processing and query parsing overhead

## Current SQL Template System Implementation

### Core Types and Interfaces

**SQL Type System** (`src/packages/dumbo/src/core/sql/sql.ts`):
```typescript
export type SQL = string & { __brand: 'sql' };

export interface DeferredSQL {
  __brand: 'deferred-sql';
  strings: TemplateStringsArray;
  values: unknown[];
}

export interface RawSQL {
  __brand: 'sql';
  sql: string;
}
```

**SQL Value Types**:
- `SQLIdentifier`: `{ [ID]: true, value: string }` - Column/table names, get quoted
- `SQLLiteral`: `{ [LITERAL]: true, value: unknown }` - User values, become escaped literals  
- `SQLRaw`: `{ [RAW]: true, value: string }` - Raw SQL fragments, inserted directly

**Helper Functions**:
- `identifier(value: string)` → `SQLIdentifier` - Creates quoted identifiers
- `literal(value: unknown)` → `SQLLiteral` - Creates escaped literals
- `raw(value: string)` → `SQLRaw` - Creates unescaped raw SQL
- `plainString(value: string)` → `SQLRaw` - Alias for `raw()` (deprecated)

**Type Guards**:
- `isIdentifier(value)`, `isLiteral(value)`, `isRaw(value)` - Symbol-based detection
- `isDeferredSQL(value)`, `isRawSQL(value)`, `isSQL(value)` - Brand-based detection

### SQL Template Function Implementation

**Main SQL Function**:
```typescript
export function SQL(strings: TemplateStringsArray, ...values: unknown[]): SQL {
  return strings.length === 1 && values.length === 0
    ? rawSql(strings[0] as string)  // Simple string → RawSQL
    : deferredSQL(strings, values); // Template → DeferredSQL
}
```

**Template Processing**:
- Single string with no interpolation → `RawSQL` 
- Template with values → `DeferredSQL` with strings/values arrays
- Brand casting: `DeferredSQL as unknown as SQL`

**SQL Utility Functions**:
- `SQL.empty` - Empty SQL object
- `SQL.concat(...sqls)` - Concatenate SQL parts without separator
- `SQL.merge(sqls, separator)` - Merge SQL parts with separator (default: space)
- `SQL.isEmpty(sql)` - Check if SQL is empty
- `SQL.format(sql, formatter)` - Format SQL to string

### Current Formatter System Implementation

**SQLFormatter Interface** (`src/packages/dumbo/src/core/sql/sqlFormatter.ts`):
```typescript
export interface SQLFormatter {
  formatIdentifier: (value: unknown) => string;
  formatLiteral: (value: unknown) => string;
  formatString: (value: unknown) => string;
  formatArray?: (array: unknown[], itemFormatter: (item: unknown) => string) => string;
  formatDate?: (value: Date) => string;
  formatObject?: (value: object) => string;
  formatBigInt?: (value: bigint) => string;
  format: (sql: SQL | SQL[]) => string;  // Current: returns string
}
```

**Formatter Registration System**:
```typescript
const formatters: Record<string, SQLFormatter> = {};

export const registerFormatter = (dialect: string, formatter: SQLFormatter): void => {
  formatters[dialect] = formatter;
};

export const getFormatter = (dialect: string): SQLFormatter => {
  const formatterKey = dialect;
  if (!formatters[formatterKey]) {
    throw new Error(`No SQL formatter registered for dialect: ${dialect}`);
  }
  return formatters[formatterKey];
};
```

### Template Processing Algorithm

**Current `processSQL()` Function**:
```typescript
function processSQL(sql: SQL, formatter: SQLFormatter): string {
  if (isRawSQL(sql)) return sql.sql;
  if (!isDeferredSQL(sql)) return sql;

  const { strings, values } = sql as DeferredSQL;
  
  // Template string interpolation
  let result = '';
  strings.forEach((string, i) => {
    result += string;
    if (i < values.length) {
      result += formatValue(values[i], formatter);
    }
  });
  
  return result;
}
```

**Value Processing Logic** (`formatValue()` function):
1. **SQL Wrapper Types**: `isIdentifier()` → `formatIdentifier()`, `isRaw()` → inline, `isLiteral()` → `formatLiteral()`
2. **Nested SQL**: `isSQL()` → recursive `processSQL()` call
3. **Primitive Types**: null/undefined → 'NULL', numbers → toString()
4. **Complex Types**: Arrays → `formatArray()`, BigInt → `formatBigInt()`, Dates → `formatDate()`, Objects → `formatObject()`
5. **Fallback**: Everything else → `formatLiteral()`

### SQL Template Value Processing

**Template Literal Traversal**:
- `strings` array contains literal parts: `["SELECT * FROM users WHERE id = ", " AND name = ", ""]`
- `values` array contains interpolated values: `[123, "John"]`
- Processing alternates: string[0] + value[0] + string[1] + value[1] + string[2]

**Nested SQL Handling**:
- Nested `SQL` objects are recursively processed by `formatValue()`
- Each nested SQL becomes a formatted string inserted into parent template
- Example: `SQL\`WHERE ${subQuery}\`` → `processSQL(subQuery)` inserted at placeholder

### Formatter Implementations Comparison

**PostgreSQL Formatter** (`pgFormat.ts`):
- **Identifiers**: `"table_name"` - quotes when needed, supports reserved words
- **Literals**: `'escaped''value'` - PostgreSQL-style quote escaping
- **Booleans**: `'t'/'f'` - PostgreSQL boolean format
- **JSON**: `'{"key":"value"}'::jsonb` - explicit JSONB casting
- **Arrays**: Complex nested parentheses handling for PostgreSQL array types
- **Dates**: ISO format with timezone conversion
- **BigInt**: String representation to prevent precision loss

**SQLite Formatter** (`sqliteFormat.ts`):
- **Identifiers**: `"column_name"` - simpler quoting rules
- **Literals**: `'escaped''value'` - same quote escaping as PostgreSQL
- **Booleans**: `1/0` - SQLite boolean representation
- **JSON**: `'{"key":"value"}'` - stored as TEXT with quote escaping
- **Arrays**: JSON serialization (no native array type)
- **Dates**: ISO string format
- **BigInt**: Range checking for SQLite INTEGER type limits

### Current Execution Implementation

**PostgreSQL Execution** (`src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts`):
```typescript
// Line 94 - Current string-based execution
const result = await client.query<Result>(pgFormatter.format(sqls[i]!));
```

**SQLite Execution** (`src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts`):
```typescript  
// Line 73 - Current string-based execution
const result = await client.query<Result>(sqliteFormatter.format(sqls[i]!));
```

**Current Flow**:
1. `SQL` object → `formatter.format(sql)` → string SQL
2. String SQL → `client.query(sqlString)` → database execution
3. No parameter separation - values embedded as literals in query string

**Tracing Current Implementation**:
```typescript
tracer.info('db:sql:query', { sql: sqls[i]! });
// Logs the SQL object, not the formatted string
```