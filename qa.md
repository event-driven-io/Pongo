# Storage Plugin Architecture Q&A

## Question 1: Core Capabilities
**Q:** What are the core capabilities that every storage driver plugin must provide?

**A:** In general Dumbo is a sneaky abstraction that can be a connection pool as a simplification, but depending on what you provide it should be able to represent e.g. connection pool that only has ambient connection, or be inside transaction or not. When someone creates dumbo/connection pool then it should be able to automatically interact with the storage. Drivers will be exposed as e.g. @event-driven-io/dumbo/pg and @event-driven-io/dumbo/sqlite3. For now they're hardcoded, but it would be good if they allow registration from outside of the codebase by users (or me if I'd like to e.g. have a closed-source implementation on top of DuckDB).

## Question 2: Plugin Registration System
**Q:** For the storage plugin registration system, should plugins be able to register at runtime or would you prefer a build-time registration approach? And should the registration automatically handle the connector string parsing?

**A:** For now, a must is to have the subset. From the outside is optional, or actually the next step. If it's not a big deal to do, we can have it since beginning, of course if it doesn't add huge performance overhead. There are two options: Either someone imports dumbo from specific storage location (e.g. @event-driven-io/dumbo/pg) then it has potentially additional typed options, etc. Or they import it from @event-driven-io/dumbo and then they don't have fully strongly typed options and all is resolved by the connection string.

## Question 3: Storage Plugin Interface Components
**Q:** For the storage plugin interface, are there any other capabilities a storage plugin must or could optionally provide beyond connection pooling, SQL execution, transactions, formatters, and migration options?

**A:** Yes, still, a lot of that it's created by core code. Eventually we'd like to have some specific database features like JSON etc. Currently Pongo handles JSON and JSONB manipulations, but that could be moved also to Dumbo. I want in the future to support stuff like pg partitioning which is only for PostgreSQL and not for SQLite. Still, that's a future concept, but something to keep in mind while creating the storage.

## Question 4: Plugin Package Structure
**Q:** For the plugin architecture, should each storage plugin be a completely separate npm package or sub-packages within dumbo? And what's the preferred registration mechanism?

**A:** For now, I'd like to keep it as it is, so keep drivers as part of dumbo, so official set of databases, keep drivers as dev dependencies, so they can be in the same codebase, and require user to install what they need. Optionally I can provide some other plugins or databases as paid ones. But that's a future concept. I want to also provide others to deliver community plugins. I think that it's fine to register it manually for now. Also a reminder that we have CLI that should work similarly and allow connecting to multiple databases. Also, you can do a mind exercise on what would be needed to e.g. add DuckDB storage with driver, or extend PostgreSQL with postgres package driver. This is more to understand what may be needed to expose rather than providing the full plan about it. We need to focus on what we have and enable future changes.

## Question 5: Database-Specific Features
**Q:** For database-specific features (like PostgreSQL partitioning, DuckDB's columnar storage, or SQLite's full-text search), how should the plugin system expose these capabilities?

**A:** If someone wants to use some additional features, then best if they were using dumbo, or if the strongly typed dumbo instance was returned with additional capabilities. We also have schemacomponents and migrations, so e.g. if someone would like to expose Postgis then this could be some PostgreSQLExtension created on schema component that could be added to the default set of migrations, or as additional one. Then we could later on add additional methods like we have single/count/exists etc. from specific "sub-package", e.g. "@event-driven-io/pg". If that requires installing additional package, then we could use the same pattern as for database drivers.

## Question 6: Error Handling and Mapping
**Q:** How should the storage plugin handle error mapping and database-specific error codes?

**A:** See how I did that in Emmett (https://github.com/event-driven-io/emmett/blob/main/src/packages/emmett/src/errors/index.ts). So we could have some specific DumboError with general status code, but we can also have PostgreSQLError that would inherit from it and also have the nested one, the real one. For those that we'd like to retry (e.g. transient or concurrency errors) we can have some predefined set, but for other we can start simple with some generic one.

## Question 7: CLI and Multiple Database Support
**Q:** For the CLI support, how should the storage plugin system handle multiple active connections and connection pooling?

**A:** I think that we can start from one session with one database. Check how this is handled currently, essentially cli/shell keeps its own dumbo instance. The challenge here is how to use it with npx and have installed the specific database driver. Check also here https://event-driven.io/en/pongo_strongly_typed_client/.

## Question 8: Backward Compatibility and Registration Pattern
**Q:** How should we handle backward compatibility during the transition to the plugin architecture? And what registration pattern would you prefer?

**A:** I'd prefer to keep the range of changes as small as possible, but I don't mind having it breaking.

## Question 9: Plugin Interface Structure
**Q:** What should be the minimum contract that every storage plugin must implement? Should it be a single object or more modular?

**A:** I think that it'd be good to have both, so default setup with default extension, but also different capabilities registered separately. Also a reminder, is that plugin is more a configuration of how that's done etc. Then when it's registered user can either use this generic dumbo with deferred connections (analyze how it works starting from src/packages/dumbo/src/storage/all/index.ts) but then if they need more then they could also use specific features from sub-package. It should also have strongly typed dumbo from specific package, so giving user flexibility.

## Question 10: Testing Strategy for Plugins
**Q:** Should there be a standard test suite for plugins? How should we handle database-specific features in tests?

**A:** It'd be good to have some predefined matrix of tests, plus plugin specific. Currently it's using unit, int and e2e - int and e2e can be run with test containers.

## Question 11: Simplifying Deferred Connection Pool Mechanism
**Q:** Could the current deferred connection pool mechanism be simplified? The async import adds overhead and complexity.

**A:** Must be bundler-friendly - cannot require imports from specific drivers in core or storage, as we need to bundle pg or sqlite3 code separately. 

**Analysis of Options:**

**Option 1: Synchronous Registration** - Won't work because it would require evaluating driver files at startup, breaking bundler separation.

**Option 2: Explicit Import Pattern** - Good for bundlers but breaking change, users must remember to import drivers.

**Option 3: Hybrid Approach** - Pre-registered plugins use fast synchronous path, fallback to deferred loading. Issue: pre-registration still requires driver code to be evaluated somewhere.

**Option 4: Build-Time Configuration** - Requires build step, less flexible.

**Revised Recommendation:** Given the bundler constraint, the current deferred mechanism or a variant of Option 2 (explicit imports) are the most viable. The deferred mechanism, while complex, achieves the goal of complete separation. 

**Possible Simplification:** Instead of deferred wrappers at every level, we could make the plugin registration itself deferred:
```typescript
// In storage/all/index.ts
registerDeferredPlugin('PostgreSQL:pg', () => import('../postgresql/pg'));
registerDeferredPlugin('SQLite:sqlite3', () => import('../sqlite/sqlite3'));

// Plugin is loaded once and cached on first use
```
This keeps separation but reduces the wrapper complexity to just the initial plugin load.

## Question 12: Single Deferred Load Point Implementation
**Q:** How would the single deferred load point differ from your current implementation, and what's the advantage of this simplified approach over the existing multiple deferred wrappers?

**A:** Current implementation has 3 layers of deferral:
- `createDeferredConnectionPool` at src/packages/dumbo/src/storage/all/index.ts:52
- `createDeferredConnection` at src/packages/dumbo/src/core/connections/pool.ts:115
- `createDeferredExecutor` at src/packages/dumbo/src/core/connections/pool.ts:104

My proposal loads the plugin ONCE and creates a smart proxy only at the pool level. After loading, all operations are direct calls to the real plugin methods - no more async wrapping at every layer.

Regarding `@event-driven-io/dumbo/pg` vs `/pg/register`: Yes, we can definitely use `@event-driven-io/dumbo/pg` directly! Like Drizzle does with `drizzle-orm/node-postgres`, the pg subpackage would:
1. Import the actual pg driver
2. Register itself as a side effect
3. Export a strongly-typed dumbo function

```typescript
// @event-driven-io/dumbo/pg/index.ts
import { plugin } from './plugin';
import { registerPlugin } from '../core';
import { dumbo as genericDumbo } from '../core';

// Auto-register on import
registerPlugin('PostgreSQL:pg', plugin);

// Export strongly-typed version
export const dumbo = (options: PostgreSQLOptions) => 
  genericDumbo<'PostgreSQL:pg'>(options);
```

This is cleaner than a separate `/register` file and matches Drizzle's pattern.

## Question 13: Smart Proxy Implementation Pattern
**Q:** How would this smart proxy actually work? Would it be something like we have for sqlFormatter or default migration options that would just store it in some plugin cache? And then resolve connector type based on the connection string?

**A:** Exactly! The smart proxy would work just like your `defaultMigratorOptions` registry pattern at src/packages/dumbo/src/core/schema/migrations.ts:35-54. 

The implementation would:
1. Have a `pluginCache` Map to store loaded plugins (like `defaultMigratorOptions`)
2. Have a `pluginLoaders` Map to store deferred loaders
3. Parse connection string to get connector type
4. Check cache first, return immediately if found
5. If not cached, create a Proxy that loads plugin on first method call
6. Cache the loaded plugin for all future use

This is much simpler than the current 3-layer deferred approach (createDeferredConnectionPool, createDeferredConnection, createDeferredExecutor). Just one load point, cached forever, exactly like your migrator options registry pattern!

## Question 14: Clarification on Sync Dumbo with Async Plugin Loading
**Q:** I don't get how the proxy works - can proxy do async code from sync method? I want dumbo to be a sync function, that's why I added this deferred stuff.

**A:** You're absolutely right! My proxy example was wrong. You can't make sync methods async with a Proxy. The `dumbo()` function MUST return synchronously, which is why you need the deferred mechanism.

The simplification would still use deferred loading, but only at ONE level instead of three:
1. `dumbo()` returns immediately with a deferred wrapper (sync)
2. The wrapper loads the plugin ONCE on first use and caches it
3. After loading, all methods directly call the real pool methods
4. No more nested deferred wrappers (createDeferredConnection, createDeferredExecutor)

So instead of: dumbo → deferred pool → deferred connection → deferred executor
We'd have: dumbo → deferred pool → real plugin methods

This keeps the sync return requirement while reducing complexity.

## Question 15: Analysis of Simpler Alternatives
**Q:** Are there actually simpler alternatives to the current deferred implementation that are still bundler-friendly and performant?

**A:** After analyzing the codebase and researching how Drizzle handles this, the reality is:

1. **Single deferred load isn't actually simpler** - You still need async wrappers for every method (execute, connection, transaction, etc.). The only difference is you're not creating intermediate deferred objects, but the surface complexity is the same.

2. **The only genuinely simpler approach is explicit driver imports** (like Drizzle):
   ```typescript
   import { dumbo } from '@event-driven-io/dumbo/pg';
   const pool = dumbo({ connectionString: '...' }); // Direct, no deferral!
   ```
   This eliminates ALL deferred loading complexity.

3. **Hybrid approach** - Keep both:
   - `@event-driven-io/dumbo` - automatic with deferred loading (current)
   - `@event-driven-io/dumbo/pg` - explicit with zero overhead (new)

**Conclusion:** The current deferred mechanism is the minimum complexity needed for automatic driver selection. There's no simpler way to achieve bundler-friendliness with automatic driver loading. The explicit import pattern is the only way to truly simplify.

## Question 16: Centralized Plugin Architecture for Extensibility
**Q:** How should we centralize plugin definition to make it easier to extend with both pre-defined and external/community plugins?

**A:** The goal is to create a centralized plugin registry that enables:
1. Built-in plugins (PostgreSQL, SQLite) 
2. Community plugins (external packages)
3. Future extensions (DuckDB, paid plugins)

**Proposed Architecture:**

1. **Central Plugin Registry** - Single Map storing all plugins (sync or async loaders)
2. **StoragePlugin Interface** - Standard contract all plugins implement:
   ```typescript
   interface StoragePlugin {
     connector: ConnectorType;
     createPool(options): ConnectionPool;
     sqlFormatter: SQLFormatter;
     defaultMigratorOptions: MigratorOptions;
   }
   ```

3. **Three Usage Patterns:**
   - **Automatic (deferred)**: `@event-driven-io/dumbo` - registers lazy loaders
   - **Explicit (direct)**: `@event-driven-io/dumbo/pg` - registers plugin on import
   - **External**: Community packages register via `registerPlugin()`

This centralization provides a single extension point for all storage plugins while maintaining bundler-friendliness and supporting the hybrid approach you want.

## Question 17: Is There Actually a Simpler Implementation?
**Q:** Given that hybrid mode already exists, is there any simpler way to implement the deferred loading than the current 3-layer approach?

**A:** No, the current implementation is already optimal for the constraints:

1. **Must return synchronously** from `dumbo()` 
2. **Zero static imports** of driver code for bundler-friendliness
3. **Lazy loading** at each level (pool, connection, executor)

The 3-layer deferred approach (createDeferredConnectionPool, createDeferredConnection, createDeferredExecutor) is the minimum viable complexity because each layer is created at different times and you can't know which methods will be called first.

The only alternative would be a single deferred wrapper that loads on ANY first method call, but this isn't simpler - it's the same number of async wrappers, just organized differently. The current implementation is already as simple as it can be while meeting all requirements.

## Question 18: Registering Multiple Drivers and Storages
**Q:** We should allow registering multiple drivers and storages. Also, the single deferred wrapper isn't a simplification - it would be harder to maintain. The design doc should specify current state and explain why we want to change it, with minimal radius of change. Breaking changes are fine since now is the time to reshape foundations.

**A:** Agreed. The spec should focus on:

1. **Current State Documentation** - The 3-layer deferred mechanism is optimal and should stay
2. **Why Change** - Enable external plugins, community contributions, multiple drivers per database type
3. **Minimal Change** - Centralized plugin registry without changing the deferred mechanism
4. **Breaking Changes OK** - This is the right time for foundational changes

The centralized plugin architecture enables:
- Multiple drivers for same database (e.g., pg, postgres.js for PostgreSQL)
- Community plugins without modifying core
- Discovery of available plugins
- Consistent interface for all storage implementations

## Question 19: Final Architecture Decision
**Q:** Given the constraints and requirements, what's the final plugin architecture?

**A:** The final architecture consists of:

1. **StoragePlugin Interface** - Standard contract for all plugins:
   ```typescript
   interface StoragePlugin {
     connector: ConnectorType;
     createPool(options): ConnectionPool;
     sqlFormatter: SQLFormatter;
     defaultMigratorOptions: MigratorOptions;
   }
   ```

2. **Central Plugin Registry** - Single point for plugin registration and retrieval
3. **Three Usage Patterns**:
   - Automatic (deferred) via `@event-driven-io/dumbo`
   - Direct (zero overhead) via `@event-driven-io/dumbo/pg`
   - External plugins via manual registration

4. **Keep Existing Optimizations**:
   - 3-layer deferred mechanism (unchanged)
   - Hybrid mode (already exists)
   - Zero static imports
   - Bundler-friendly architecture

This provides extensibility while maintaining all current optimizations and patterns.

## Question 20: Handling tryGetSync and Plugin Extensions
**Q:** Can we add tryGetSync to avoid race conditions? Also, how should we handle SQLBuilder for Pongo - maybe as extensions to registered plugins? PostgreSQL could use partitioning, SQLite does it differently.

**A:** Yes, `tryGetSync()` is better than separate `hasSync()`/`getSync()` to avoid race conditions:
```typescript
// Safer single method
tryGetSync(connector: ConnectorType): StoragePlugin | undefined {
  const entry = this.plugins.get(connector);
  return typeof entry !== 'function' ? entry : undefined;
}
```

For SQLBuilder and schema differences, we discussed options:
1. Extensions as part of plugin
2. Separate extension registry (PongoPlugin)
3. Extension hooks

## Question 21: PongoPlugin as Separate Extension?
**Q:** So, about option 2. Would it be like PongoPlugin?

**A:** Yes, exactly! A `PongoPlugin` interface would provide database-specific implementations for Pongo. Each database would have its own PongoPlugin with appropriate strategies (PostgreSQL using partitioning, SQLite using separate tables, etc.).

## Question 22: Hybrid Approach for Extensions
**Q:** I think that mixture of 1 and 2 could be actually good. Giving Pongo clear Plugins and also getting strong typing and enabling specific Dumbo capabilities based on config.

**A:** Agreed! The hybrid approach combines:

1. **Built-in extensions** on the StoragePlugin:
```typescript
interface StoragePlugin {
  // Core fields...
  capabilities?: {
    json?: { operators: boolean; indexing: boolean; path: boolean; };
    arrays?: boolean;
    returning?: boolean;
  };
  extensions?: {
    pongo?: PongoPlugin;  // Strongly typed, built-in
  };
}
```

2. **Minimal PongoPlugin** (based on current usage):
```typescript
interface PongoPlugin {
  sqlBuilder: (collectionName: string) => PongoCollectionSQLBuilder;
  createCollectionSchema: (name: string) => SchemaComponent;
}
```

3. **Capabilities** enable Dumbo to adapt SQL generation based on database features

This gives:
- Strong typing for known extensions (Pongo)
- Feature detection via capabilities
- Database-specific optimizations
- Clean separation of concerns

## Question 23: Relationship Between PongoPlugin and StoragePlugin
**Q:** What's the relationship between PongoPlugin and Dumbo plugin?

**A:** PongoPlugin is an optional extension within StoragePlugin:
- **StoragePlugin** = Main Dumbo plugin for database connectivity
- **PongoPlugin** = Optional extension inside StoragePlugin.extensions
- Single registration handles both Dumbo core and Pongo needs
- Databases can support Dumbo-only or Dumbo+Pongo

## Question 24: Generic DumboExtension Registration
**Q:** Let's say that PongoPlugin will be some generic DumboExtension, how would we register it?

**A:** Yes, making it generic as `DumboExtension` is better. For registration, we have options:

**Option 1: Built-in Known Extensions**
```typescript
interface StoragePlugin {
  // Core fields...
  extensions?: {
    [key: string]: DumboExtension;  // Generic
    // Or with known types:
    pongo?: PongoExtension;
    migrations?: MigrationExtension;
  };
}

// Register everything at once
pluginRegistry.register('PostgreSQL:pg', {
  connector: 'PostgreSQL:pg',
  createPool: pgPool,
  extensions: {
    pongo: pgPongoExtension,
    migrations: pgMigrationExtension
  }
});
```

**Option 2: Separate Extension Registration**
```typescript
// Register core plugin first
pluginRegistry.register('PostgreSQL:pg', pgPlugin);

// Register extensions separately
pluginRegistry.registerExtension(
  'PostgreSQL:pg', 
  'pongo', 
  pgPongoExtension
);
```

**Option 3: Extension Registration on Plugin**
```typescript
interface StoragePlugin {
  registerExtension(name: string, extension: DumboExtension): void;
}

// Register core first
const plugin = pluginRegistry.register('PostgreSQL:pg', pgPlugin);

// Then add extensions
plugin.registerExtension('pongo', pgPongoExtension);
```

Option 1 seems simplest - everything registered together, strongly typed for known extensions, but still extensible via string keys.

## Question 25: How Pongo Should Work with Plugin Architecture
**Q:** I want Dumbo working on its own but able to register extensions like PongoExtension. Users should be able to use pongoClient with just a connection string (generic) or import from driver-specific path without needing driver name.

**A:** Pongo should follow the same pattern as Dumbo:
- `@event-driven-io/pongo` - generic, parses connection string
- `@event-driven-io/pongo/pg` - specific, knows it's PostgreSQL

Since Dumbo is a dependency of Pongo (not the reverse), Pongo registers its own extensions.

## Question 26: How Would Generic Pongo Work with Extensions?
**Q:** How would generic work? How would Pongo Extension be registered?

**A:** The generic path has the same bundler constraints as Dumbo - we can't import all database code. Pongo needs its own deferred loading:

```typescript
// pongo/src/index.ts - Generic path
import { dumbo, pluginRegistry } from '@event-driven-io/dumbo';

// NO STATIC IMPORTS! Only deferred loaders
const pongoExtensionLoaders = {
  'PostgreSQL:pg': () => import('./storage/postgresql/extension').then(m => m.extension),
  'SQLite:sqlite3': () => import('./storage/sqlite/extension').then(m => m.extension)
};

export function pongoClient(options) {
  const connector = parseConnectionString(options.connectionString);
  
  // Check if already loaded (optimization)
  let pongoExt = pluginRegistry.tryGetExtension(connector, 'pongo');
  
  if (!pongoExt) {
    // Need deferred loading
    const loader = pongoExtensionLoaders[connector];
    if (!loader) throw new Error(`Pongo doesn't support: ${connector}`);
    
    // Return deferred Pongo client (like Dumbo's deferred pool)
    return createDeferredPongoClient(connector, async () => {
      const ext = await loader();
      pluginRegistry.registerExtension(connector, 'pongo', ext);
      const pool = dumbo(options); // Also deferred
      return createPongoClient(pool, ext);
    });
  }
  
  // Already loaded - no deferral!
  const pool = dumbo(options);
  return createPongoClient(pool, pongoExt);
}
```

```typescript
// pongo/src/pg/index.ts - Specific path
import { dumbo } from '@event-driven-io/dumbo/pg';
import { pluginRegistry } from '@event-driven-io/dumbo';
import { pgPongoExtension } from '../storage/postgresql/extension';

// Register on module load
pluginRegistry.registerExtension('PostgreSQL:pg', 'pongo', pgPongoExtension);

export function pongoClient(options) {
  const pool = dumbo(options); // Direct dumbo/pg
  return createPongoClient(pool, pgPongoExtension);
}
```

This maintains:
- Zero static imports in generic path
- Bundler-friendly tree-shaking
- Optimization via side-effect loading
- Same UX as Dumbo (generic vs specific paths)