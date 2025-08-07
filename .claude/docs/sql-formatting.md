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

## Value Type Handling in Current System

### SQL Template Value Processing

**Current Value Types:**
- `SQLIdentifier`: Column/table names - stay in query string, get quoted
- `SQLLiteral`: User values - become escaped string literals  
- `SQLRaw`: Raw SQL fragments - inserted directly without escaping

**Type Processing Flow:**
1. Template literal values processed by `formatValue()` in `sqlFormatter.ts:47`
2. Type detection via `isIdentifier()`, `isLiteral()`, `isRaw()`, `isSQL()` guards
3. Database-specific formatting applied via formatter implementations

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