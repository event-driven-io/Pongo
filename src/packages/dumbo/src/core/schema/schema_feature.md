# Schema Feature Component Design

## Overview

This document defines the design for **Feature Schema Components** - a composable, opaque abstraction layer for complex database features like event stores, Pongo collections, and custom application features that can be integrated seamlessly into Dumbo's schema system.

## Problem Statement

Current Dumbo schema components (`database`, `schema`, `table`, `column`, `index`) work well for explicit table definitions, but pose challenges for:

1. **Complex Features**: Features like event stores have multiple tables, functions, and internal structure that users shouldn't need to understand
2. **Framework Integration**: Pongo collections need both Dumbo tables (for migrations) and Pongo schema (for querying)
3. **Multi-Database Support**: Same schema definition should work across PostgreSQL (with schemas), SQLite (without schemas), and other databases
4. **Multi-Tenancy**: Need flexible sharding strategies applicable at different levels (table, schema, database)
5. **System Metadata**: Migration tracking and schema introspection tables need consistent, configurable placement

## Design Principles

1. **Opaque by Default**: Users don't need to know internal structure of features (e.g., event store tables)
2. **Composable**: Features compose like other schema components
3. **Strongly Typed**: Generated types expose internal structure for type-safe queries
4. **Database Agnostic**: Schema definitions are portable; migration generation is database-specific
5. **Extensible**: Generic sharding mechanism supports multi-tenancy and custom partitioning strategies
6. **Explicit When Needed**: Power users can customize feature internals and placement

## Core Concepts

### 1. Feature Schema Component

A feature is an opaque schema component that encapsulates internal components (tables, functions, etc.).

```typescript
// Base marker interface for all features
export type FeatureSchemaComponent<
  URN extends string = string,
  AdditionalData extends Record<string, unknown> = Record<string, unknown>,
> = SchemaComponent<
  URN,
  AdditionalData & {
    __featureMarker: true;
    internalComponents: ReadonlyMap<string, SchemaComponent>; // Hidden from user API
  }
>;

// Type guard
export const isFeatureSchemaComponent = (
  comp: AnySchemaComponent,
): comp is FeatureSchemaComponent => {
  return '__featureMarker' in comp && comp.__featureMarker === true;
};
```

### 2. Event Store Schema Component

Event store as a first-class feature component.

```typescript
export type EventStoreSchemaComponent = FeatureSchemaComponent<
  'sc:dumbo:feature:event_store',
  {
    eventStoreName?: string;
    inlineProjections?: Record<string, PongoCollectionSchema>;
  }
>;

export const eventStoreSchema = (options?: {
  inlineProjections?: Record<string, PongoCollectionSchema>;
}): EventStoreSchemaComponent => {
  // Create internal tables (opaque to user)
  const streams = dumboTable('streams', {
    migrations: [sqlMigration('create_streams', [streamsTableSQL])],
  });

  const messages = dumboTable('messages', {
    migrations: [sqlMigration('create_messages', [messagesTableSQL])],
  });

  const subscriptions = dumboTable('subscriptions', {
    migrations: [sqlMigration('create_subscriptions', [subscriptionsTableSQL])],
  });

  // Create functions
  const appendFunction = dumboFunction('emt_append_to_stream', {
    migrations: [sqlMigration('create_append_function', [appendToStreamSQL])],
  });

  // Handle inline projections (create tables from Pongo collections)
  const projectionTables = Object.entries(options?.inlineProjections ?? {}).map(
    ([name, collectionSchema]) =>
      dumboTable(collectionSchema.name, {
        // Auto-generate table structure for Pongo collection
        migrations: [
          sqlMigration(`create_projection_${name}`, [
            // Generate CREATE TABLE with _id and document columns
          ]),
        ],
      }),
  );

  const allComponents = [
    streams,
    messages,
    subscriptions,
    appendFunction,
    ...projectionTables,
  ];

  const base = schemaComponent('sc:dumbo:feature:event_store', {
    components: allComponents,
  });

  return {
    ...base,
    __featureMarker: true as const,
    eventStoreName: 'event_store',
    inlineProjections: options?.inlineProjections,
    internalComponents: new Map(
      allComponents.map((c) => [c.schemaComponentKey, c]),
    ),
  };
};
```

### 3. Pongo Collections Schema Component

Bridges Pongo's collection abstraction with Dumbo's table-based migrations.

```typescript
export type PongoCollectionsSchemaComponent = FeatureSchemaComponent<
  'sc:dumbo:feature:pongo_collections',
  {
    pongoSchema: PongoDbSchema;
  }
>;

export const pongoCollectionsSchema = (
  collections: Record<string, PongoCollectionSchema>,
): PongoCollectionsSchemaComponent => {
  // Create Dumbo table for each Pongo collection
  const tables = Object.entries(collections).map(([_name, collectionSchema]) =>
    dumboTable(collectionSchema.name, {
      migrations: [
        sqlMigration(`create_collection_${collectionSchema.name}`, [
          // Auto-generate table structure:
          // CREATE TABLE {name} (
          //   _id TEXT PRIMARY KEY,
          //   document JSONB NOT NULL,
          //   created_at TIMESTAMP DEFAULT NOW(),
          //   updated_at TIMESTAMP DEFAULT NOW()
          // )
        ]),
      ],
    }),
  );

  const base = schemaComponent('sc:dumbo:feature:pongo_collections', {
    components: tables,
  });

  return {
    ...base,
    __featureMarker: true as const,
    pongoSchema: pongoSchema.db(collections),
    internalComponents: new Map(tables.map((t) => [t.schemaComponentKey, t])),
  };
};
```

### 4. System Schema Component

Contains framework metadata tables (migrations, pongo metadata, schema introspection).

```typescript
export type SystemSchemaComponent = FeatureSchemaComponent<
  'sc:dumbo:feature:system',
  {
    systemTables: {
      migrationTracking: boolean;
      pongoMetadata: boolean;
      schemaIntrospection: boolean;
    };
  }
>;

export function systemSchema(): SystemSchemaComponent;
export function systemSchema(schemaName: string): DatabaseSchemaSchemaComponent;
export function systemSchema(options: {
  migrationTracking?: boolean;
  pongoMetadata?: boolean;
  schemaIntrospection?: boolean;
}): SystemSchemaComponent;
export function systemSchema(
  nameOrOptions?:
    | string
    | {
        migrationTracking?: boolean;
        pongoMetadata?: boolean;
        schemaIntrospection?: boolean;
      },
): SystemSchemaComponent | DatabaseSchemaSchemaComponent {
  const options =
    typeof nameOrOptions === 'string'
      ? { schemaName: nameOrOptions }
      : nameOrOptions;

  const tables: TableSchemaComponent[] = [];

  if (options?.migrationTracking !== false) {
    tables.push(
      dumboTable('__migrations', {
        migrations: [
          sqlMigration('create_migrations_table', [
            SQL`CREATE TABLE IF NOT EXISTS __migrations (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          applied_at TIMESTAMP DEFAULT NOW()
        )`,
          ]),
        ],
      }),
    );
  }

  if (options?.pongoMetadata !== false) {
    tables.push(
      dumboTable('__pongo_collections', {
        migrations: [
          sqlMigration('create_pongo_metadata_table', [
            SQL`CREATE TABLE IF NOT EXISTS __pongo_collections (
          collection_name TEXT PRIMARY KEY,
          json_schema JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`,
          ]),
        ],
      }),
    );
  }

  if (options?.schemaIntrospection !== false) {
    tables.push(
      dumboTable('__schema_metadata', {
        migrations: [
          sqlMigration('create_schema_metadata_table', [
            SQL`CREATE TABLE IF NOT EXISTS __schema_metadata (
          component_type TEXT NOT NULL,
          component_name TEXT NOT NULL,
          component_key TEXT PRIMARY KEY,
          definition JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`,
          ]),
        ],
      }),
    );
  }

  const base = schemaComponent('sc:dumbo:feature:system', {
    components: tables,
  });

  const component = {
    ...base,
    __featureMarker: true as const,
    systemTables: {
      migrationTracking: options?.migrationTracking !== false,
      pongoMetadata: options?.pongoMetadata !== false,
      schemaIntrospection: options?.schemaIntrospection !== false,
    },
    internalComponents: new Map(tables.map((t) => [t.schemaComponentKey, t])),
  } satisfies SystemSchemaComponent;

  // If schemaName provided, wrap in schema component
  if ('schemaName' in options && options.schemaName) {
    return dumboDatabaseSchema(options.schemaName, {}).addComponent(component);
  }

  return component;
}

export const isSystemSchemaComponent = (
  comp: AnySchemaComponent,
): comp is SystemSchemaComponent => {
  return comp.schemaComponentKey === 'sc:dumbo:feature:system';
};
```

### 5. Function Schema Component

First-class support for stored procedures/functions.

```typescript
export type FunctionURNType = 'sc:dumbo:function';
export type FunctionURN = `${FunctionURNType}:${string}`;

export type FunctionSchemaComponent = SchemaComponent<
  FunctionURN,
  Readonly<{
    functionName: string;
    language?: 'plpgsql' | 'sql' | 'javascript'; // Database-specific
  }>
>;

export const dumboFunction = (
  name: string,
  options: SchemaComponentOptions & {
    language?: 'plpgsql' | 'sql' | 'javascript';
  },
): FunctionSchemaComponent => {
  const base = schemaComponent(`sc:dumbo:function:${name}` as FunctionURN, {
    migrations: options.migrations ?? [],
    components: options.components ?? [],
  });

  return {
    ...base,
    functionName: name,
    language: options.language,
  };
};
```

## Usage Examples

### Example 1: Simple Single-Schema Application

```typescript
// Everything in one schema, system tables auto-added
const simpleApp = dumboDatabase('my_app', {
  public: dumboDatabaseSchema('public', {
    users: dumboTable('users', {
      columns: {
        id: dumboColumn('id', { type: 'serial', primaryKey: true }),
        email: dumboColumn('email', { type: 'varchar', length: 255 }),
      },
    }),
    posts: dumboTable('posts', {
      columns: {
        id: dumboColumn('id', { type: 'serial', primaryKey: true }),
        userId: dumboColumn('user_id', { type: 'int' }),
      },
    }),
  }),
});

// System tables (__migrations, __pongo_collections, __schema_metadata)
// are automatically added to the 'public' schema
```

### Example 2: Event Store with Read Models

```typescript
// Event store and read models in same schema
const hotelApp = dumboDatabase('hotel', {
  public: dumboDatabaseSchema('public', {
    // Event store feature (opaque - user doesn't see internal tables)
    eventStore: eventStoreSchema(),

    // User-defined tables
    guests: dumboTable('guests', {
      columns: {
        id: dumboColumn('id', { type: 'serial', primaryKey: true }),
        name: dumboColumn('name', { type: 'varchar', length: 255 }),
      },
    }),

    reservations: dumboTable('reservations', {
      columns: {
        id: dumboColumn('id', { type: 'serial', primaryKey: true }),
        guestId: dumboColumn('guest_id', { type: 'int' }),
      },
    }),
  }),
});

// Generated migrations include:
// - System tables: __migrations, __pongo_collections, __schema_metadata
// - Event store tables: streams, messages, subscriptions
// - Event store function: emt_append_to_stream
// - User tables: guests, reservations
```

### Example 3: Separated Schemas

```typescript
// Event store and read models in separate schemas
const hotelApp = dumboDatabase('hotel', {
  // Dedicated system schema
  system: systemSchema('system'),

  // Event store in its own schema
  event_store: dumboDatabaseSchema('event_store', {
    eventStore: eventStoreSchema(),
  }),

  // Read models in separate schema
  read_models: dumboDatabaseSchema('read_models', {
    guests: dumboTable('guests', {
      /* ... */
    }),
    reservations: dumboTable('reservations', {
      /* ... */
    }),
  }),
});

// PostgreSQL generates:
// CREATE SCHEMA system;
// CREATE TABLE system.__migrations (...);
// CREATE SCHEMA event_store;
// CREATE TABLE event_store.streams (...);
// CREATE SCHEMA read_models;
// CREATE TABLE read_models.guests (...);
```

### Example 4: Event Store with Inline Projections

```typescript
const hotelApp = dumboDatabase('hotel', {
  event_store: dumboDatabaseSchema('event_store', {
    eventStore: eventStoreSchema({
      // Inline projections become tables in same schema
      inlineProjections: {
        guestSummary: pongoSchema.collection('guest_summary'),
        reservationSummary: pongoSchema.collection('reservation_summary'),
      },
    }),
  }),

  read_models: dumboDatabaseSchema('read_models', {
    // Or define Pongo collections as a feature
    collections: pongoCollectionsSchema({
      guests: pongoSchema.collection('guests'),
      reservations: pongoSchema.collection('reservations'),
    }),
  }),
});

// event_store schema contains:
// - streams, messages, subscriptions (event store core)
// - guest_summary, reservation_summary (inline projections)
//
// read_models schema contains:
// - guests, reservations (Pongo collections → Dumbo tables)
```

### Example 5: Multiple Databases with Database Group

```typescript
// Database group for organizing related databases
const hotelSystemGroup = databaseGroup(
  'hotel_system',
  {
    // Operational database
    operational: dumboDatabase('hotel_operational', {
      event_store: dumboDatabaseSchema('event_store', {
        eventStore: eventStoreSchema(),
      }),
      read_models: dumboDatabaseSchema('read_models', {
        guests: dumboTable('guests', {
          /* ... */
        }),
        reservations: dumboTable('reservations', {
          /* ... */
        }),
      }),
    }),

    // Analytics database
    analytics: dumboDatabase('hotel_analytics', {
      public: dumboDatabaseSchema('public', {
        events: dumboTable('events', {
          /* ... */
        }),
        metrics: dumboTable('metrics', {
          /* ... */
        }),
      }),
    }),

    // Reporting database
    reporting: dumboDatabase('hotel_reporting', {
      public: dumboDatabaseSchema('public', {
        reports: dumboTable('reports', {
          /* ... */
        }),
      }),
    }),
  },
  {
    // Shared system schema across all databases
    shared: {
      systemSchema: systemSchema('shared_system'),
    },
  },
);
```

## System Schema Placement Strategy

### Single Schema

When database has exactly one schema, system tables are automatically added to that schema.

```typescript
const db = dumboDatabase('app', {
  public: dumboDatabaseSchema('public', {
    /* ... */
  }),
});
// ✅ System tables → 'public' schema
```

### Multiple Schemas Without Explicit System Schema

Default behavior: Use database type's default schema convention.

```typescript
const db = dumboDatabase('app', {
  event_store: dumboDatabaseSchema('event_store', {
    /* ... */
  }),
  read_models: dumboDatabaseSchema('read_models', {
    /* ... */
  }),
});

// PostgreSQL: Check for 'public' schema, otherwise use first schema
// ✅ If 'public' exists → system tables go there
// ✅ Otherwise → system tables go to 'event_store' (first schema)

// SQLite: Use first schema (schema names become table prefixes)
// ✅ System tables → 'event_store' schema (prefixed: event_store___migrations)
```

### Explicit System Schema

User can explicitly place system schema anywhere:

```typescript
// Option A: Dedicated system schema
const db = dumboDatabase('app', {
  system: systemSchema('admin'), // Returns DatabaseSchemaSchemaComponent
  event_store: dumboDatabaseSchema('event_store', {
    /* ... */
  }),
  read_models: dumboDatabaseSchema('read_models', {
    /* ... */
  }),
});

// Option B: System schema within existing schema
const db = dumboDatabase('app', {
  event_store: dumboDatabaseSchema('event_store', {
    system: systemSchema(), // Just the component
    eventStore: eventStoreSchema(),
  }),
  read_models: dumboDatabaseSchema('read_models', {
    /* ... */
  }),
});
```

## Generic Sharding Strategy

### Sharding Configuration

```typescript
export type ShardingStrategy<TShardKey extends string = string> = {
  // How to identify this shard dimension
  shardKey: TShardKey;

  // What values this shard can have
  shardValues: readonly string[] | 'dynamic';

  // Naming pattern for the sharded resource
  namingPattern: string | ((shard: string, original: string) => string);

  // Which resources should NOT be sharded (shared across all shards)
  exclude?: string[] | ((resourceName: string) => boolean);
};

export type ShardingLevel = 'table' | 'schema' | 'database' | 'database-group';

export type ShardingConfig = {
  level: ShardingLevel;
  strategy: ShardingStrategy;

  // Optional: Apply sharding only to specific components
  applyTo?: string[];
};
```

### Predefined Sharding Strategies

```typescript
export const shardingStrategies = {
  // Multi-tenancy: Shard by tenant ID
  multiTenant: (tenants: string[] | 'dynamic'): ShardingStrategy => ({
    shardKey: 'tenant_id',
    shardValues: tenants,
    namingPattern: '{shard}_{resource}',
    exclude: ['system'], // Don't shard system schema
  }),

  // Geographic regions
  region: (regions: string[]): ShardingStrategy => ({
    shardKey: 'region',
    shardValues: regions,
    namingPattern: '{resource}_{shard}',
  }),

  // Time-based partitioning
  timePartition: (periods: string[]): ShardingStrategy => ({
    shardKey: 'period',
    shardValues: periods, // e.g., ['2024_01', '2024_02', ...]
    namingPattern: '{resource}_{shard}',
  }),

  // Customer-based sharding
  customerId: (customerIds: string[] | 'dynamic'): ShardingStrategy => ({
    shardKey: 'customer_id',
    shardValues: customerIds,
    namingPattern: 'cust_{shard}_{resource}',
  }),
};
```

### Sharding Examples

#### Schema-Level Sharding (Multi-Tenancy)

```typescript
const hotelApp = dumboDatabase(
  'hotel',
  {
    system: systemSchema('system'), // Not sharded

    event_store: dumboDatabaseSchema('event_store', {
      eventStore: eventStoreSchema(),
    }),

    read_models: dumboDatabaseSchema('read_models', {
      guests: dumboTable('guests', {
        /* ... */
      }),
      reservations: dumboTable('reservations', {
        /* ... */
      }),
    }),
  },
  {
    sharding: {
      level: 'schema',
      strategy: shardingStrategies.multiTenant(['hilton', 'marriott', 'hyatt']),
    },
  },
);

// PostgreSQL generates:
// CREATE SCHEMA system; -- Not sharded
// CREATE SCHEMA hilton_event_store;
// CREATE TABLE hilton_event_store.streams (...);
// CREATE SCHEMA hilton_read_models;
// CREATE TABLE hilton_read_models.guests (...);
// CREATE SCHEMA marriott_event_store;
// CREATE TABLE marriott_event_store.streams (...);
// CREATE SCHEMA marriott_read_models;
// CREATE TABLE marriott_read_models.guests (...);
// ...
```

#### Database-Level Sharding

```typescript
const hotelApp = dumboDatabase(
  'hotel',
  {
    event_store: dumboDatabaseSchema('event_store', {
      /* ... */
    }),
    read_models: dumboDatabaseSchema('read_models', {
      /* ... */
    }),
  },
  {
    sharding: {
      level: 'database',
      strategy: shardingStrategies.multiTenant(['hilton', 'marriott']),
    },
  },
);

// PostgreSQL generates separate databases:
// CREATE DATABASE hilton_hotel;
// CREATE DATABASE marriott_hotel;

// SQLite generates separate files:
// hilton_hotel.db
// marriott_hotel.db
```

#### Table-Level Sharding (Time Partitioning)

```typescript
const analyticsDb = dumboDatabase(
  'analytics',
  {
    public: dumboDatabaseSchema('public', {
      events: dumboTable('events', {
        /* ... */
      }),
      metrics: dumboTable('metrics', {
        /* ... */
      }),
    }),
  },
  {
    sharding: {
      level: 'table',
      strategy: shardingStrategies.timePartition([
        '2024_01',
        '2024_02',
        '2024_03',
      ]),
      applyTo: ['events'], // Only shard events table
    },
  },
);

// Generates:
// CREATE TABLE events_2024_01 (...);
// CREATE TABLE events_2024_02 (...);
// CREATE TABLE events_2024_03 (...);
// CREATE TABLE metrics (...); -- Not sharded
```

#### Database Group Sharding

```typescript
const hotelSystemGroup = databaseGroup(
  'hotel_system',
  {
    operational: dumboDatabase('hotel_operational', {
      /* ... */
    }),
    analytics: dumboDatabase('hotel_analytics', {
      /* ... */
    }),
    reporting: dumboDatabase('hotel_reporting', {
      /* ... */
    }),
  },
  {
    sharding: {
      level: 'database',
      strategy: shardingStrategies.multiTenant(['hilton', 'marriott']),
    },
    shared: {
      systemSchema: systemSchema('shared_system'),
    },
  },
);

// Generates for each tenant:
// Tenant 'hilton':
//   Database: hilton_hotel_operational
//   Database: hilton_hotel_analytics
//   Database: hilton_hotel_reporting
//   Shared: shared_system schema (referenced from all databases)
//
// Tenant 'marriott':
//   Database: marriott_hotel_operational
//   Database: marriott_hotel_analytics
//   Database: marriott_hotel_reporting
//   Shared: shared_system schema (referenced from all databases)
```

### Component-Level Sharding Override

```typescript
// Different sharding strategies for different schemas
const hotelApp = dumboDatabase('hotel', {
  system: systemSchema('system'), // No sharding

  event_store: dumboDatabaseSchema(
    'event_store',
    {
      eventStore: eventStoreSchema(),
    },
    {
      // Override: shard event store by tenant
      sharding: {
        level: 'schema',
        strategy: shardingStrategies.multiTenant(['hilton', 'marriott']),
      },
    },
  ),

  analytics: dumboDatabaseSchema(
    'analytics',
    {
      events: dumboTable('events', {
        /* ... */
      }),
    },
    {
      // Override: shard analytics by region
      sharding: {
        level: 'table',
        strategy: shardingStrategies.region(['us_east', 'us_west', 'eu']),
      },
    },
  ),
});

// Generates:
// CREATE SCHEMA system;
// CREATE SCHEMA hilton_event_store;
// CREATE SCHEMA marriott_event_store;
// CREATE SCHEMA analytics;
// CREATE TABLE analytics.events_us_east (...);
// CREATE TABLE analytics.events_us_west (...);
// CREATE TABLE analytics.events_eu (...);
```

## Database Group Design

### Database Group Component

```typescript
export type DatabaseGroup<
  Databases extends Record<string, DatabaseSchemaComponent> = Record<
    string,
    DatabaseSchemaComponent
  >,
> = {
  groupName: string;
  databases: Databases;

  // Group-level sharding configuration
  sharding?: ShardingConfig;

  // Resources shared across all databases in group
  shared?: {
    systemSchema?: SystemSchemaComponent;
  };
};

export const databaseGroup = <
  T extends Record<string, DatabaseSchemaComponent>,
>(
  groupName: string,
  databases: T,
  options?: {
    sharding?: ShardingConfig;
    shared?: {
      systemSchema?: SystemSchemaComponent;
    };
  },
): DatabaseGroup<T> => ({
  groupName,
  databases,
  sharding: options?.sharding,
  shared: options?.shared,
});
```

### Use Cases for Database Groups

1. **Logical Organization**: Group related databases for documentation and architecture diagrams
2. **Shared Sharding**: Apply same sharding strategy across multiple databases
3. **Shared Resources**: Single system schema referenced by multiple databases
4. **CQRS/Event Sourcing**: Separate databases for commands, queries, and events
5. **Polyglot Persistence**: Different databases for different concerns (operational, analytics, reporting)

## Migration Generation

### Database-Agnostic Schema, Database-Specific Migrations

Schema definitions are portable; migration generation considers database type:

```typescript
// Schema definition (database-agnostic)
const hotelSchema = dumboDatabase('hotel', {
  event_store: dumboDatabaseSchema('event_store', {
    eventStore: eventStoreSchema(),
  }),
  read_models: dumboDatabaseSchema('read_models', {
    guests: dumboTable('guests', {
      /* ... */
    }),
  }),
});

// PostgreSQL migration generation
const pgMigrations = generateMigrations(hotelSchema, {
  databaseType: 'postgresql',
});
// Generates:
// CREATE SCHEMA event_store;
// CREATE TABLE event_store.streams (...);
// CREATE SCHEMA read_models;
// CREATE TABLE read_models.guests (...);

// SQLite migration generation
const sqliteMigrations = generateMigrations(hotelSchema, {
  databaseType: 'sqlite',
  sqliteStrategy: 'prefix-tables', // or 'separate-files'
});
// prefix-tables generates:
// CREATE TABLE event_store_streams (...);
// CREATE TABLE read_models_guests (...);
//
// separate-files generates:
// File: event_store.db → CREATE TABLE streams (...);
// File: read_models.db → CREATE TABLE guests (...);
```

### Migration Collection from Features

The migration orchestrator detects feature components and extracts their internal migrations:

```typescript
export const collectAllMigrations = (
  database: DatabaseSchemaComponent,
): SQLMigration[] => {
  const migrations: SQLMigration[] = [];

  for (const schema of database.schemas.values()) {
    for (const component of schema.components.values()) {
      if (isFeatureSchemaComponent(component)) {
        // Feature component: extract internal components
        for (const internalComp of component.internalComponents.values()) {
          if (isTableComponent(internalComp)) {
            migrations.push(...internalComp.migrations);
          } else if (isFunctionComponent(internalComp)) {
            migrations.push(...internalComp.migrations);
          }
        }
      } else if (isTableComponent(component)) {
        // Regular table
        migrations.push(...component.migrations);
      } else if (isFunctionComponent(component)) {
        // Regular function
        migrations.push(...component.migrations);
      }
    }
  }

  return migrations;
};
```

## Type Generation

### Exposing Feature Internals in Generated Types

While features are opaque at definition time, generated types expose internal structure for type-safe queries:

```typescript
// Schema definition (event store is opaque)
const hotelSchema = dumboDatabase('hotel', {
  public: dumboDatabaseSchema('public', {
    eventStore: eventStoreSchema(),
    guests: dumboTable('guests', {
      /* ... */
    }),
  }),
});

// Generated types expose all tables (including event store internals)
export type HotelSchema = {
  public: {
    // Event store tables (exposed for type-safe queries)
    streams: {
      stream_id: string;
      stream_position: number;
      partition: string;
      stream_type: string;
      stream_metadata: unknown;
      is_archived: boolean;
    };
    messages: {
      stream_id: string;
      stream_position: number;
      partition: string;
      message_kind: string;
      message_data: unknown;
      message_metadata: unknown;
      message_schema_version: string;
      message_type: string;
      message_id: string;
      is_archived: boolean;
      global_position: number;
      created: Date;
    };
    subscriptions: {
      subscription_id: string;
      version: number;
      partition: string;
      last_processed_position: number;
    };

    // User-defined tables
    guests: {
      id: number;
      name: string;
      email: string;
    };
  };
};

// Usage with type-safe queries
const stream = await db
  .from('streams') // TypeScript knows this exists
  .where('stream_id', '=', 'guest-123')
  .select(['stream_position', 'stream_type']);
// Type: { stream_position: number, stream_type: string }[]
```

## Integration with Emmett Architecture

Feature components are separate from Emmett architectural components but can be mapped:

```typescript
// Emmett: Logical architecture (business components with ports)
const hotelManagementContainer = emmettArch.container('hotel-management', {
  eventStore: emmettArch.component('event-store', {
    ports: {
      exposes: {
        commands: {
          appendToStream: (/* ... */) => Promise.resolve(),
        },
      },
    },
  }),

  guests: emmettArch.component('guests', {
    ports: {
      exposes: {
        queries: {
          getGuestByExternalId: query<string, Guest>(),
        },
      },
    },
  }),

  reservations: emmettArch.component('reservations', {
    ports: {
      requires: {
        guests: {
          getGuestByExternalId: query<string, Guest>(),
        },
      },
    },
  }),
});

// Dumbo: Physical schema (database structure)
const hotelSchema = dumboDatabase('hotel', {
  event_store: dumboDatabaseSchema('event_store', {
    eventStore: eventStoreSchema(),
  }),

  read_models: dumboDatabaseSchema('read_models', {
    guests: dumboTable('guests', {
      /* ... */
    }),
    reservations: dumboTable('reservations', {
      /* ... */
    }),
  }),
});

// Mapping layer (optional - for documentation/tooling)
const deployment = {
  architecture: hotelManagementContainer,
  schema: hotelSchema,
  mapping: {
    // Map Emmett components to Dumbo schemas/tables
    'event-store': 'event_store.eventStore',
    guests: 'read_models.guests',
    reservations: 'read_models.reservations',
  },
};
```

## Design Decisions

### 1. Why Feature Components Extend SchemaComponent?

- **Uniform Composition**: Features compose like tables, indexes, etc.
- **Consistent API**: Same `addComponent()` pattern everywhere
- **Type Safety**: Generic `SchemaComponent` infrastructure works for features
- **Migration System**: Features participate in migration collection automatically

### 2. Why System Schema is a Feature Component?

- **Consistent Placement**: Same composition rules as other features
- **Flexible Location**: Can be in dedicated schema or mixed with application schemas
- **Opaque Internals**: Users don't need to know about **migrations, **pongo_collections tables
- **Customizable**: Power users can configure which system tables to include

### 3. Why Generic Sharding vs. Hardcoded Multi-Tenancy?

- **Extensibility**: Supports time partitioning, regional sharding, custom strategies
- **Composition**: Can combine multiple sharding dimensions in the future
- **Flexibility**: Same mechanism for different use cases (multi-tenancy, scaling, compliance)
- **Simplicity**: Single concept to learn instead of multiple special cases

### 4. Why Database Groups?

- **Organization**: Large systems have multiple related databases
- **Shared Resources**: System schema can be shared across databases
- **Consistent Sharding**: Apply same tenant strategy to command/query/event databases
- **Documentation**: Architecture diagrams show logical database groupings

### 5. Why Portable Schema Definitions?

- **Developer Experience**: Write once, deploy to PostgreSQL or SQLite
- **Testing**: Test with SQLite, deploy to PostgreSQL
- **Flexibility**: Change database type without rewriting schema
- **Separation of Concerns**: Schema = logical structure, migrations = physical implementation

## Future Enhancements

### 1. Composable Sharding (Out of Scope for Initial Implementation)

Support multiple sharding dimensions:

```typescript
{
  sharding: [
    { level: 'database', strategy: shardingStrategies.multiTenant(['hilton']) },
    { level: 'schema', strategy: shardingStrategies.region(['us', 'eu']) },
    { level: 'table', strategy: shardingStrategies.timePartition(['2024_01']) },
  ];
}
// Generates: Database hilton_hotel → Schema us_event_store → Table events_2024_01
```

### 2. Pattern-Based Exclusion (Future)

Support patterns in sharding exclusion:

```typescript
{
  sharding: {
    strategy: tenantSharding,
    exclude: [
      'system',      // Exact match
      '__*',         // Glob pattern: all system tables
      /^temp_/,      // Regex: temporary tables
      (name) => name.startsWith('cache_'), // Function
    ]
  }
}
```

### 3. Dynamic Shard Provisioning (Out of Scope for Schema Definition)

Runtime provisioning of new shards (tenants, regions, etc.):

```typescript
// This is a runtime concern, not schema definition
const provisioner = createShardProvisioner(schema, config);
await provisioner.provisionShard(connection, 'new_tenant_id');
```

### 4. Cross-Database Relationships (Future)

Support foreign keys across sharded databases:

```typescript
// Define relationship that spans databases
const relationship = crossDatabaseForeignKey(
  'read_models.reservations.guest_id',
  'read_models.guests.id',
  { onDelete: 'CASCADE' },
);
```

### 5. Migration Dependency Graph (Future)

Explicit migration dependencies for complex scenarios:

```typescript
const createUsersMigration = sqlMigration('create_users', [
  /* ... */
]);
const createPostsMigration = sqlMigration(
  'create_posts',
  [
    /* ... */
  ],
  {
    dependsOn: [createUsersMigration], // Posts table needs users table first
  },
);
```

## Open Questions

### Q1: Function Component Placement

Should functions be:

- Top-level components in schema (like tables)?
- Nested within table components?
- Only within feature components?

**Current decision**: Top-level and within features (flexible)

### Q2: SQLite Multiple Schema Strategy Default

For SQLite with multiple schemas, default to:

- Table prefixing (simpler, single file)
- Separate database files (stronger isolation)
- Error (force explicit choice)

**Current decision**: Table prefixing (simpler default, user can override)

### Q3: System Schema Naming Convention

Should system schema default name be:

- `__dumbo_system` (clear it's framework)
- `_system` (shorter)
- `system` (clean but might conflict)

**Current decision**: `system` for dedicated schema, auto-add to first schema otherwise

### Q4: Sharding Naming Pattern Syntax

Support only string templates, or also functions?

- String: `'{shard}_{resource}'`
- Function: `(shard, resource) => ...`

**Current decision**: Both (string for simplicity, function for flexibility)

### Q5: Feature Component Registration

Should there be a registry for custom feature components?

```typescript
// Register custom feature
registerFeatureComponent('custom_feature', {
  detect: (comp) => comp.schemaComponentKey.startsWith('sc:custom:'),
  extractMigrations: (comp) => {
    /* ... */
  },
});
```

**Current decision**: Not yet - keep simple, add if needed

## Implementation Checklist

### Phase 1: Core Feature Components

- [ ] `FeatureSchemaComponent` base type
- [ ] `isFeatureSchemaComponent()` type guard
- [ ] `EventStoreSchemaComponent` implementation
- [ ] `PongoCollectionsSchemaComponent` implementation
- [ ] `SystemSchemaComponent` implementation
- [ ] `FunctionSchemaComponent` implementation

### Phase 2: System Schema Placement

- [ ] Auto-detection logic for single schema
- [ ] Database type default schema logic (PostgreSQL 'public', etc.)
- [ ] Explicit system schema placement
- [ ] System schema component tests

### Phase 3: Generic Sharding

- [ ] `ShardingStrategy` type definition
- [ ] `ShardingConfig` type definition
- [ ] Predefined strategies (`multiTenant`, `region`, `timePartition`)
- [ ] Sharding at database level
- [ ] Sharding at schema level
- [ ] Sharding at table level
- [ ] Exclusion logic for shared resources

### Phase 4: Database Groups

- [ ] `DatabaseGroup` type definition
- [ ] `databaseGroup()` factory function
- [ ] Shared system schema across databases
- [ ] Group-level sharding
- [ ] Migration generation for groups

### Phase 5: Migration Generation

- [ ] Detect feature components in migration collector
- [ ] Extract internal migrations from features
- [ ] Database-specific migration generation (PostgreSQL vs SQLite)
- [ ] SQLite table prefixing strategy
- [ ] SQLite separate files strategy
- [ ] Sharding-aware migration generation

### Phase 6: Type Generation

- [ ] Extract internal structure from features
- [ ] Generate types for event store tables
- [ ] Generate types for Pongo collections
- [ ] Generate types for custom features
- [ ] Exclude system tables from main types (optional)

### Phase 7: Integration & Documentation

- [ ] Dumbo schema API updates
- [ ] Pongo schema integration
- [ ] Emmett architecture mapping examples
- [ ] Unit tests for all components
- [ ] Integration tests with PostgreSQL
- [ ] Integration tests with SQLite
- [ ] Documentation and examples

## Related Files

- [MIGRATION_UNIFICATION_PLAN.md](./MIGRATION_UNIFICATION_PLAN.md) - Migration system design
- [schemaComponent.ts](./schemaComponent.ts) - Base schema component implementation
- [dumboSchema.ts](./dumboSchema/dumboSchema.ts) - Dumbo schema builder API
- [pongo/schema/index.ts](../../../pongo/src/core/schema/index.ts) - Pongo schema system
- Emmett Architecture (external package) - Component/container/system definitions

## References

- [Dumbo Migration Unification Plan](./MIGRATION_UNIFICATION_PLAN.md) - Context on migration system
- [Pongo Strongly Typed Client](https://event-driven.io/en/pongo_strongly_typed_client/) - Pongo collection schema
- [Emmett Projections Testing](https://event-driven.io/en/emmett_projections_testing/) - Event store and projections
- C4 Model - Architectural component hierarchy (system → container → component)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-31
**Status**: Design Proposal
**Authors**: Based on collaborative design discussion
