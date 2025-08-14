# RFC: Storage Plugin Architecture for Dumbo

**RFC Status:** Draft  
**Date:** 2025-01-14  
**Author:** Event-Driven.io Team  

## 1. Abstract

This RFC proposes a centralized plugin architecture for Dumbo's storage system to enable community-contributed database drivers while maintaining the existing hybrid usage model (automatic deferred loading and direct imports) and bundler optimizations.

## 2. Motivation

### 2.1 Problem Statement

Dumbo currently supports PostgreSQL and SQLite through hard-coded driver imports in `storage/all/index.ts`. This approach:

- **Prevents** external developers from adding new database drivers
- **Requires** core code modifications to add new databases
- **Lacks** a standard interface for storage implementations
- **Limits** future extensibility for proprietary or paid drivers

### 2.2 Goals

1. Enable community plugin development without modifying core
2. Support multiple drivers per database type (e.g., both `pg` and `postgres.js` for PostgreSQL)
3. Maintain the hybrid usage model that users already rely on
4. Preserve bundler optimizations (tree-shaking, code splitting)
5. Allow future support for closed-source/proprietary drivers

### 2.3 Non-Goals

- Simplifying the deferred loading mechanism (already optimal)
- Supporting driver versioning (too complex for initial implementation)
- Changing core abstractions (ConnectionPool, Connection, Executor)
- Breaking the existing public API for built-in drivers

## 3. Background

### 3.1 Current Architecture

Dumbo provides two usage patterns:

#### Automatic Mode (Deferred Loading)
```typescript
import { dumbo } from '@event-driven-io/dumbo';
const pool = dumbo({ connectionString: 'postgresql://...' }); // Returns immediately
```
- Connection string parsed to determine driver
- Driver loaded on first use via dynamic import
- 3-layer deferred mechanism for optimal lazy loading

#### Direct Mode (Zero Overhead)
```typescript
import { dumbo } from '@event-driven-io/dumbo/postgresql/pg';
const pool = dumbo({ connectionString: 'postgresql://...' }); // Direct, no deferral
```
- Driver imported statically
- No deferred loading overhead
- Strongly typed for specific database

### 3.2 Why the Current Deferred Mechanism is Optimal

The 3-layer deferred approach is necessary because:

1. **Synchronous Return Requirement** - `dumbo()` must return immediately
2. **Zero Static Imports** - Bundlers must not include unused drivers
3. **Lazy at Every Level** - Pool, connections, and executors created at different times
4. **Unknown Call Order** - Cannot predict which methods users call first

Each layer (`createDeferredConnectionPool`, `createDeferredConnection`, `createDeferredExecutor`) serves a specific purpose and cannot be simplified without breaking these constraints.

## 4. Detailed Design

### 4.1 Core Components

#### 4.1.1 StoragePlugin Interface

```typescript
// @event-driven-io/dumbo/src/core/plugins/types.ts
export interface StoragePlugin<
  Connector extends ConnectorType = ConnectorType
> {
  // Unique identifier for this plugin
  readonly connector: Connector;
  
  // Factory for creating connection pools
  createPool(options: DumboConnectionOptions): ConnectionPool<Connection<Connector>>;
  
  // SQL formatter for this database dialect
  readonly sqlFormatter: SQLFormatter;
  
  // Default migration configuration
  readonly defaultMigratorOptions: MigratorOptions;
}
```

#### 4.1.2 Plugin Registry

```typescript
// @event-driven-io/dumbo/src/core/plugins/registry.ts
export class PluginRegistry {
  private readonly plugins = new Map<
    ConnectorType, 
    StoragePlugin | (() => Promise<StoragePlugin>)
  >();
  
  register(
    connector: ConnectorType, 
    plugin: StoragePlugin | (() => Promise<StoragePlugin>)
  ): void {
    if (this.plugins.has(connector)) {
      throw new Error(`Plugin already registered for connector: ${connector}`);
    }
    this.plugins.set(connector, plugin);
  }
  
  async resolve(connector: ConnectorType): Promise<StoragePlugin> {
    const entry = this.plugins.get(connector);
    if (!entry) {
      throw new Error(`No plugin registered for connector: ${connector}`);
    }
    
    // Handle lazy-loaded plugins
    if (typeof entry === 'function') {
      const plugin = await entry();
      // Cache resolved plugin
      this.plugins.set(connector, plugin);
      return plugin;
    }
    
    return entry;
  }
  
  // Try to get already-loaded plugin synchronously (safer than separate has/get)
  tryGetSync(connector: ConnectorType): StoragePlugin | undefined {
    const entry = this.plugins.get(connector);
    return typeof entry !== 'function' ? entry : undefined;
  }
  
  list(): ConnectorType[] {
    return Array.from(this.plugins.keys());
  }
  
  has(connector: ConnectorType): boolean {
    return this.plugins.has(connector);
  }
}

// Global singleton instance
export const pluginRegistry = new PluginRegistry();
```

### 4.2 Impact on Hybrid Mode

The plugin architecture **enhances** the hybrid mode without breaking it:

#### 4.2.1 Automatic Mode (Unchanged User Experience)

```typescript
// @event-driven-io/dumbo/src/storage/all/index.ts
import { pluginRegistry } from '../../core/plugins/registry';
import { createDeferredConnectionPool } from '../../core/connections';
import { parseConnectionString } from './connections';

// Built-in plugins registered with lazy loading
pluginRegistry.register('PostgreSQL:pg', 
  () => import('../postgresql/pg/plugin').then(m => m.plugin)
);
pluginRegistry.register('SQLite:sqlite3', 
  () => import('../sqlite/sqlite3/plugin').then(m => m.plugin)
);

export function dumbo<DatabaseOptions extends DumboConnectionOptions>(
  options: DatabaseOptions
): Dumbo {
  const { connectionString } = options;
  const { databaseType, driverName } = parseConnectionString(connectionString);
  const connector = `${databaseType}:${driverName}` as ConnectorType;
  
  // OPTIMIZATION: If plugin is already loaded (via side-effect), 
  // use it directly without deferral!
  const plugin = pluginRegistry.tryGetSync(connector);
  if (plugin) {
    return plugin.createPool(options); // Direct, no deferral
  }
  
  // Otherwise use deferred mechanism
  return createDeferredConnectionPool(connector, async () => {
    const plugin = await pluginRegistry.resolve(connector);
    return plugin.createPool(options);
  });
}
```

#### 4.2.2 Direct Mode (Enhanced with Plugin Pattern)

```typescript
// @event-driven-io/dumbo/src/storage/postgresql/pg/index.ts
import { pluginRegistry } from '../../../core/plugins/registry';
import { nodePostgresPool } from './connections';
import { postgresqlFormatter } from '../core/sql/formatter';
import { postgresqlMigratorOptions } from '../core/schema/migrations';
import type { PostgreSQLOptions, PostgreSQLPool } from './types';

// Create and register plugin
const pgPlugin: StoragePlugin<'PostgreSQL:pg'> = {
  connector: 'PostgreSQL:pg',
  createPool: nodePostgresPool,
  sqlFormatter: postgresqlFormatter,
  defaultMigratorOptions: postgresqlMigratorOptions
};

// Register on module load (side effect)
pluginRegistry.register('PostgreSQL:pg', pgPlugin);

// Direct export - NO DEFERRAL, same as today
export function dumbo(options: PostgreSQLOptions): PostgreSQLPool {
  return nodePostgresPool(options);
}

// Also export the plugin for those who need it
export { pgPlugin };
```

**Key Point:** Direct mode bypasses the deferred mechanism entirely. Users get:
- Zero overhead (no async wrappers)
- Immediate execution
- Full type safety
- Same API as before

### 4.3 Usage Patterns

#### 4.3.1 Built-in Drivers (No Change for Users)

```typescript
// Automatic mode - deferred
import { dumbo } from '@event-driven-io/dumbo';
const pool = dumbo({ connectionString: 'postgresql://...' });

// Direct mode - zero overhead (PREFERRED for production)
import { dumbo } from '@event-driven-io/dumbo/pg';
const pool = dumbo({ connectionString: 'postgresql://...' });
```

#### 4.3.2 External/Community Plugins

```typescript
// Plugin package: @acme/dumbo-duckdb
import { pluginRegistry, type StoragePlugin } from '@event-driven-io/dumbo';

const duckDBPlugin: StoragePlugin<'DuckDB:nodejs'> = {
  connector: 'DuckDB:nodejs',
  createPool: createDuckDBPool,
  sqlFormatter: duckDBFormatter,
  defaultMigratorOptions: duckDBMigratorOptions
};

// Option 1: Auto-register on import (side effect)
pluginRegistry.register('DuckDB:nodejs', duckDBPlugin);

// Option 2: Explicit registration function
export function registerDuckDB(): void {
  pluginRegistry.register('DuckDB:nodejs', duckDBPlugin);
}

// Option 3: Direct usage (recommended)
export function dumbo(options: DuckDBOptions): DuckDBPool {
  return createDuckDBPool(options);
}
```

User code:
```typescript
// Using automatic mode with external plugin
import { dumbo } from '@event-driven-io/dumbo';
import '@acme/dumbo-duckdb'; // Side effect registration

const pool = dumbo({ connectionString: 'duckdb://...' });

// Using direct mode (PREFERRED)
import { dumbo } from '@acme/dumbo-duckdb';
const pool = dumbo({ connectionString: 'duckdb://...' }); // Zero overhead
```

### 4.4 Plugin Extensions (Hybrid Approach)

The plugin system supports extensions through a combination of built-in and registered extensions:

#### Core Plugin with Optional Extensions

```typescript
// Core storage plugin interface
interface StoragePlugin<Config = unknown> {
  // Required core functionality
  connector: ConnectorType;
  createPool(options: DumboConnectionOptions): ConnectionPool;
  sqlFormatter: SQLFormatter;
  defaultMigratorOptions: MigratorOptions;
  
  // Optional: Enable specific Dumbo capabilities based on config
  capabilities?: {
    json?: {
      operators: boolean;
      indexing: boolean;
      path: boolean;
    };
    arrays?: boolean;
    returning?: boolean;
    cte?: boolean;
  };
  
  // Optional: Built-in extensions
  extensions?: {
    pongo?: PongoPlugin;
    // Future: other extensions
  };
}

// Strongly-typed Pongo extension
interface PongoPlugin {
  sqlBuilder: (collectionName: string) => PongoCollectionSQLBuilder;
  schemaStrategy: 'partitioning' | 'separate-tables' | 'single-table';
  createCollectionSchema: (name: string) => SchemaComponent;
  supportedFeatures?: {
    partitioning?: boolean;
    jsonIndexes?: boolean;
    generatedColumns?: boolean;
  };
}
```

#### Implementation Examples

```typescript
// PostgreSQL plugin with built-in Pongo support
const pgPlugin: StoragePlugin = {
  connector: 'PostgreSQL:pg',
  createPool: nodePostgresPool,
  sqlFormatter: postgresqlFormatter,
  defaultMigratorOptions: postgresqlMigratorOptions,
  
  // Declare capabilities for Dumbo
  capabilities: {
    json: {
      operators: true,  // Supports ->, ->>, @>, etc.
      indexing: true,   // GIN indexes
      path: true        // #> and #>> operators
    },
    arrays: true,
    returning: true,
    cte: true
  },
  
  // Built-in Pongo extension
  extensions: {
    pongo: {
      sqlBuilder: postgresPongoSQLBuilder,
      schemaStrategy: 'partitioning',
      createCollectionSchema: (name) => pgPartitionedCollection(name),
      supportedFeatures: {
        partitioning: true,
        jsonIndexes: true,
        generatedColumns: true
      }
    }
  }
};

// SQLite plugin with different capabilities
const sqlitePlugin: StoragePlugin = {
  connector: 'SQLite:sqlite3',
  createPool: sqlitePool,
  sqlFormatter: sqliteFormatter,
  defaultMigratorOptions: sqliteMigratorOptions,
  
  capabilities: {
    json: {
      operators: true,  // JSON1 extension
      indexing: false,  // No GIN, but can index generated columns
      path: true        // json_extract
    },
    arrays: false,      // No native arrays
    returning: true,    // RETURNING clause supported
    cte: true
  },
  
  extensions: {
    pongo: {
      sqlBuilder: sqlitePongoSQLBuilder,
      schemaStrategy: 'separate-tables', // Different strategy!
      createCollectionSchema: (name) => sqliteCollectionTable(name),
      supportedFeatures: {
        partitioning: false,
        jsonIndexes: true,   // Via generated columns
        generatedColumns: true
      }
    }
  }
};

// Usage in Dumbo - can check capabilities
const plugin = await pluginRegistry.resolve(connector);
if (plugin.capabilities?.json?.operators) {
  // Use native JSON operators
  return SQL`${column} -> ${SQL.literal(path)}`;
} else {
  // Fall back to json_extract or similar
  return SQL`json_extract(${column}, ${SQL.literal('$.' + path)})`;
}

// Usage in Pongo - strongly typed extension
const plugin = await pluginRegistry.resolve(connector);
const pongoExt = plugin.extensions?.pongo;

if (pongoExt) {
  // Use database-specific optimizations
  const sqlBuilder = pongoExt.sqlBuilder(collectionName);
  if (pongoExt.supportedFeatures?.partitioning) {
    // Enable partitioning features
  }
} else {
  // Fall back to generic implementation
  const sqlBuilder = genericPongoSQLBuilder(collectionName);
}
```

#### Additional Extension Registry for Third-Party

```typescript
// For extensions not known at compile time
class ExtensionRegistry {
  private extensions = new Map<string, unknown>();
  
  register<T>(connector: ConnectorType, extensionName: string, extension: T): void {
    const key = `${connector}:${extensionName}`;
    this.extensions.set(key, extension);
  }
  
  get<T>(connector: ConnectorType, extensionName: string): T | undefined {
    const key = `${connector}:${extensionName}`;
    return this.extensions.get(key) as T | undefined;
  }
}

// Community can register their own extensions
pluginRegistry.extensions.register(
  'DuckDB:nodejs',
  'analytics',
  duckDBAnalyticsExtension
);
```

#### Option 3: Extension Hooks

```typescript
interface StoragePlugin {
  // ... core fields ...
  
  // Hook for registering capabilities
  onRegister?: (registry: ExtensionRegistry) => void;
}

// PostgreSQL plugin
const pgPlugin: StoragePlugin = {
  connector: 'PostgreSQL:pg',
  createPool: nodePostgresPool,
  // ...
  onRegister: (registry) => {
    registry.provide('pongo:sqlBuilder', postgresPongoSQLBuilder);
    registry.provide('pongo:schema', 'partitioning');
  }
};
```

**Note:** The specific approach for extensions should be determined based on:
- How many extensions are expected
- Whether extensions need to interact with each other
- Performance implications of lookup mechanisms
- Type safety requirements

## 5. Implementation Plan

### 5.1 Phase 1: Core Infrastructure

1. Create `core/plugins/types.ts` with `StoragePlugin` interface
2. Create `core/plugins/registry.ts` with `PluginRegistry` class
3. Export both from main `@event-driven-io/dumbo` entry point

### 5.2 Phase 2: Refactor Built-in Drivers

For each driver (PostgreSQL, SQLite):

1. Create `plugin.ts` file implementing `StoragePlugin`
2. Update direct import (`pg/index.ts`) to:
   - Register plugin as side effect
   - Keep direct `dumbo` export unchanged
3. Update `storage/all/index.ts` to use registry

### 5.3 Phase 3: System Integration

1. Update migration system to get options from plugin registry
2. Update SQL formatter resolution to use plugin registry
3. Add plugin discovery utilities if needed

### 5.4 Phase 4: Documentation

1. Document `StoragePlugin` interface
2. Create plugin development guide
3. Provide migration guide for existing users
4. Create example external plugin

## 6. Migration Strategy

### 6.1 For End Users

**No changes required for existing code:**

```typescript
// This continues to work exactly as before
import { dumbo } from '@event-driven-io/dumbo/postgresql/pg';
const pool = dumbo({ connectionString: '...' });

// This also continues to work
import { dumbo } from '@event-driven-io/dumbo';
const pool = dumbo({ connectionString: 'postgresql://...' });
```

### 6.2 For Plugin Developers

New capability to create plugins:

```typescript
import type { StoragePlugin } from '@event-driven-io/dumbo';

export const myPlugin: StoragePlugin = {
  connector: 'MyDB:driver',
  createPool: (options) => { /* implementation */ },
  sqlFormatter: myFormatter,
  defaultMigratorOptions: myMigratorOptions
};

// Provide direct export (recommended)
export function dumbo(options: MyDBOptions): MyDBPool {
  return myPlugin.createPool(options);
}
```

## 7. Drawbacks

1. **Additional Abstraction Layer** - Plugin interface adds complexity
2. **Breaking Change** - Plugin developers must implement new interface
3. **Registry Management** - Global singleton could cause conflicts

## 8. Alternatives Considered

### 8.1 Build-Time Configuration
- **Rejected:** Requires build tools, less flexible

### 8.2 Simplify Deferred Mechanism
- **Rejected:** Current implementation is already optimal for constraints

### 8.3 Package.json Plugin Discovery
- **Rejected:** Too complex for initial implementation

## 9. Unresolved Questions

1. Should we support plugin versioning in the future?
2. Should plugins declare capability flags?
3. How to handle plugin conflicts (same connector registered twice)?

## 10. Security Considerations

1. **Plugin Trust** - Users must trust external plugins they install
2. **No Automatic Loading** - Plugins must be explicitly imported/registered
3. **Type Safety** - TypeScript ensures plugin contract compliance

## 11. Conclusion

This plugin architecture provides:

- **For Users:** Same API, more database choices, optimal performance
- **For Contributors:** Clear interface to implement
- **For Maintainers:** Centralized extension point

The hybrid mode is preserved and enhanced:
- **Automatic mode** remains deferred for flexibility (useful for Pongo)
- **Direct mode** remains zero-overhead for performance (preferred for production)
- **NEW: Side-effect optimization** - Pre-loading plugins via side-effect imports eliminates deferral even in automatic mode
- **Both modes** work with external plugins

Key optimizations:
1. **Side-effect registration** allows `@event-driven-io/dumbo` to skip deferral if plugin is pre-loaded
2. **Pongo benefits** from this by allowing users to optimize with a simple import
3. **SQLBuilder** becomes plugin-specific instead of hardcoded to PostgreSQL

The changes are minimal and focused on extensibility, not reimplementation.