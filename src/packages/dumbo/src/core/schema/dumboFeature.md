read src/packages/dumbo/src/core/schema/MIGRATION_UNIFICATION_PLAN.md first, then tell me how would you recommend to join it with src/packages/pongo/src/core/schema/index.ts where pongo database could be either database or database per database schema. Also how would that fit Architecture as Code defined as:

export type EmmettRelationshipType = string;

export type PortRequirements = Record<string, unknown>;

export type EmmettArchModule<
Requires extends PortRequirements | undefined = undefined,
Exposes extends PortRequirements | undefined = undefined,

> = {
> name: string;
> } & (Requires extends undefined
> ? Exposes extends undefined

    ? { ports?: undefined } // both undefined: ports optional
    : { ports: { exposes: Exposes } } // only Exposes defined

: Exposes extends undefined
? { ports: { requires: Requires } } // only Requires defined
: { ports: { requires: Requires; exposes: Exposes } }); // both defined

export type AnyEmmettArchModule = EmmettArchModule<any, any>;

export interface EmmettRelationship<
Source extends AnyEmmettArchModule = AnyEmmettArchModule,
Target extends AnyEmmettArchModule = AnyEmmettArchModule,

> {
> source: Source['name'];
> target: Target['name'];
> type: EmmettRelationshipType;
> description?: string;
> }

export type EmmettRelationshipsMap<
Source extends AnyEmmettArchModule = AnyEmmettArchModule,
Target extends AnyEmmettArchModule = AnyEmmettArchModule,

> = Record<Target['name'], EmmettRelationship<Source, Target>>;

export type EmmettComponent<
NestedComponents extends
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Record<string, EmmettComponent<any>> | undefined = undefined,
Requires extends PortRequirements | undefined = undefined,
Exposes extends PortRequirements | undefined = undefined,

> = EmmettArchModule<Requires, Exposes> &
> (NestedComponents extends undefined

    ? { components?: undefined }
    : { components: NestedComponents });

export interface EmmettContainer<
T extends Record<string, EmmettComponent> = Record<string, EmmettComponent>,

> extends EmmettArchModule {
> components?: T;
> }

export interface EmmettSystem<
T extends Record<string, EmmettContainer> = Record<string, EmmettContainer>,

> extends EmmettArchModule {
> containers?: T;
> }

// export type EmmettComponentsMap<T extends Record<string, EmmettComponent>> = {
// [K in keyof T]: EmmettComponent<
// T[K] extends EmmettComponent<infer U> ? U : unknown
// >;
// };

export type EmmettContainersMap<T extends Record<string, EmmettContainer>> = {
[K in keyof T]: EmmettContainer<
T[K] extends EmmettContainer<infer U> ? U : Record<string, EmmettComponent>

> ;
> };

export type EmmettSystemsMap<T extends Record<string, EmmettSystem>> = {
[K in keyof T]: EmmettSystem<
T[K] extends EmmettSystem<infer U> ? U : Record<string, EmmettContainer>

> ;
> };

// const emmettComponent = <T extends Omit<EmmettComponent<any>, 'name'>>(
// name: string,
// config?: T,
// ) => {
// return { name, ...config } satisfies EmmettComponent;
// };

export type ComponentsOf<T extends EmmettComponent> = T extends {
components: infer M;
}
? M
: undefined;

export function emmettComponent<
const Config extends {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
components?: Record<string, EmmettComponent<any>>;
ports?: {
requires?: PortRequirements;
exposes?: PortRequirements;
};
},

> (
> name: string,
> config?: Config,
> ): {
> name: string;
> components: Config extends { components: infer C } ? C : undefined;
> ports: Config extends { ports: infer P } ? P : undefined;
> } {
> return {

    name,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    components: config?.components as any,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    ports: config?.ports as any,

};
}

// ({
// name,
// relationships: config?.relationships ? config.relationships : undefined,
// }) satisfies EmmettComponent<T> as unknown as TReturn;

function emmettContainer<T extends Record<string, EmmettComponent>>(
name: string,
components?: T,
): EmmettContainer<T> {
return {
name,
components,
};
}

const emmettSystem = <T extends Record<string, EmmettContainer>>(
name: string,
containers?: T,
): EmmettSystem<T> => ({
name,
containers,
});

const emmettRelationship = <
Source extends AnyEmmettArchModule,
Target extends AnyEmmettArchModule,

> (
> source: Source,
> type: EmmettRelationshipType,
> target: Target,
> bundle?: (

    target: Target['ports']['exposes'],

) => Partial<Source['ports']['requires']>,
description?: string,
): EmmettRelationship<Source, Target> => ({
source: source.name,
target: target.name,
type,
description,
});

type ModuleBuilder<Source extends AnyEmmettArchModule> = {
relationship: <Target extends AnyEmmettArchModule>(
target: Target,
type: EmmettRelationshipType,
description?: string,
) => EmmettRelationship<Source, Target>;
};

export const moduleBuilder = <Source extends AnyEmmettArchModule>(
ctx: Source,
): ModuleBuilder<Source> => ({
relationship: <Target extends AnyEmmettArchModule>(
target: Target,
type: EmmettRelationshipType,
description?: string,
) => emmettRelationship(ctx, type, target, undefined, description),
});

export const emmettArch = {
system: emmettSystem,
container: emmettContainer,
component: emmettComponent,
relationship: emmettRelationship,
};

and

import { emmettArch } from '.';

const { component, container, relationship } = emmettArch;

const query =
<Input, Output>() =>
(\_input: Input) =>
Promise.resolve<Output>({} as Output);

const getGuestByExternalId = (\_externalId: string): Promise<string> =>
Promise.resolve(\_externalId);

const guests = component('guests', {
components: {},
ports: {
requires: {},
exposes: {
queries: {
getGuestByExternalId,
},
},
},
});

const pricing = component('pricing');

const groupReservations = component('group-reservations');

const reservations = component('reservations', {
components: { groupReservations },
ports: {
requires: {
guests: {
getGuestByExternalId: query<string, string>(),
},
},
exposes: {},
},
});

const reservationsToGuests = relationship(
reservations,
'provides guest information to',
guests,
({ queries: { getGuestByExternalId } }) => ({
guests: {
getGuestByExternalId,
},
}),
);

const hotelManagement = container('hotel-management', {
guests,
reservations,
pricing,
});

Where we could define container and pass dumboSchema to define modules inside e.g. postgresqlContainer (in the c4 model sense),

Also how could I define also event store having multiple tables and functions, e.g.

import type { SQLiteConnection } from '../../connection';
import {
globalTag,
messagesTable,
streamsTable,
subscriptionsTable,
} from './typing';

export const sql = (sql: string) => sql;

export const streamsTableSQL = sql(
`CREATE TABLE IF NOT EXISTS ${streamsTable.name}(
      stream_id         TEXT                      NOT NULL,
      stream_position   BIGINT                    NOT NULL DEFAULT 0,
      partition         TEXT                      NOT NULL DEFAULT '${globalTag}',
      stream_type       TEXT                      NOT NULL,
      stream_metadata   JSONB                     NOT NULL,
      is_archived       BOOLEAN                   NOT NULL DEFAULT FALSE,
      PRIMARY KEY (stream_id, partition, is_archived),
      UNIQUE (stream_id, partition, is_archived)
  );`,
);

export const messagesTableSQL = sql(
`CREATE TABLE IF NOT EXISTS ${messagesTable.name}(
      stream_id              TEXT                      NOT NULL,
      stream_position        BIGINT                    NOT NULL,
      partition              TEXT                      NOT NULL DEFAULT '${globalTag}',
      message_kind           CHAR(1)                   NOT NULL DEFAULT 'E',
      message_data           JSONB                     NOT NULL,
      message_metadata       JSONB                     NOT NULL,
      message_schema_version TEXT                      NOT NULL,
      message_type           TEXT                      NOT NULL,
      message_id             TEXT                      NOT NULL,
      is_archived            BOOLEAN                   NOT NULL DEFAULT FALSE,
      global_position        INTEGER                   PRIMARY KEY,
      created                DATETIME                  DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (stream_id, stream_position, partition, is_archived)
  ); 
`,
);

export const subscriptionsTableSQL = sql(
`  CREATE TABLE IF NOT EXISTS ${subscriptionsTable.name}(
      subscription_id                 TEXT                   NOT NULL,
      version                         INTEGER                NOT NULL DEFAULT 1,
      partition                       TEXT                   NOT NULL DEFAULT '${globalTag}',
      last_processed_position         BIGINT                NOT NULL,
      PRIMARY KEY (subscription_id, partition, version)
  );`,
);

export const schemaSQL: string[] = [
streamsTableSQL,
messagesTableSQL,
subscriptionsTableSQL,
];

export const createEventStoreSchema = async (
db: SQLiteConnection,
): Promise<void> => {
for (const sql of schemaSQL) {
await db.command(sql);
}
};

export const appendToStreamSQL = rawSql(
`CREATE OR REPLACE FUNCTION emt_append_to_stream(
v_message_ids text[],
v_messages_data jsonb[],
v_messages_metadata jsonb[],
v_message_schema_versions text[],
v_message_types text[],
v_message_kinds text[],
v_stream_id text,
v_stream_type text,
v_expected_stream_position bigint DEFAULT NULL,
v_partition text DEFAULT emt_sanitize_name('default_partition')
) RETURNS TABLE (
success boolean,
next_stream_position bigint,
global_positions bigint[],
transaction_id xid8
) LANGUAGE plpgsql
AS $$
DECLARE
v_next_stream_position bigint;
v_position bigint;
v_updated_rows int;
v_transaction_id xid8;
v_global_positions bigint[];
BEGIN
v_transaction_id := pg_current_xact_id();

      IF v_expected_stream_position IS NULL THEN
          SELECT COALESCE(
            (SELECT stream_position
            FROM ${streamsTable.name}
            WHERE stream_id = v_stream_id
              AND partition = v_partition
              AND is_archived = FALSE
            LIMIT 1),
            0
        ) INTO v_expected_stream_position;
      END IF;

      v_next_stream_position := v_expected_stream_position + array_upper(v_messages_data, 1);

      IF v_expected_stream_position = 0 THEN
          INSERT INTO ${streamsTable.name}
              (stream_id, stream_position, partition, stream_type, stream_metadata, is_archived)
          VALUES
              (v_stream_id, v_next_stream_position, v_partition, v_stream_type, '{}', FALSE);
      ELSE
          UPDATE ${streamsTable.name} as s
          SET stream_position = v_next_stream_position
          WHERE stream_id = v_stream_id AND stream_position = v_expected_stream_position AND partition = v_partition AND is_archived = FALSE;

          get diagnostics v_updated_rows = row_count;

          IF v_updated_rows = 0 THEN
              RETURN QUERY SELECT FALSE, NULL::bigint, NULL::bigint[], NULL::xid8;
              RETURN;
          END IF;
      END IF;

      WITH ev AS (
          SELECT row_number() OVER () + v_expected_stream_position AS stream_position,
                message_data,
                message_metadata,
                schema_version,
                message_id,
                message_type,
                message_kind
          FROM (
              SELECT *
              FROM
                unnest(v_message_ids, v_messages_data, v_messages_metadata, v_message_schema_versions, v_message_types, v_message_kinds)
              AS message(message_id, message_data, message_metadata, schema_version, message_type, message_kind)
          ) AS message
      ),
      all_messages_insert AS (
          INSERT INTO ${messagesTable.name}
              (stream_id, stream_position, partition, message_data, message_metadata, message_schema_version, message_type, message_kind, message_id, transaction_id)
          SELECT
              v_stream_id, ev.stream_position, v_partition, ev.message_data, ev.message_metadata, ev.schema_version, ev.message_type, ev.message_kind, ev.message_id, v_transaction_id
          FROM ev
          RETURNING global_position
      )
      SELECT
          array_agg(global_position ORDER BY global_position) INTO v_global_positions
      FROM
          all_messages_insert;

      RETURN QUERY SELECT TRUE, v_next_stream_position, v_global_positions, v_transaction_id;

END;

$$
;
`,
);

Potentially in different schemas (e.g. event store in one schema, read models using pongo in others.

How could this be explicit? would we introduce some databaseFeatureSchemaComponent or databaseSchemaFeatureSchemaComponent?

How to make it explicit that we're adding feature that can have multiple types of components but also be able to locate it in the specific schema or database?

If I'm not clear enough, please ask for more. Ultrathink
[Show more]
I'll read the migration plan first to understand the context, then analyze how to integrate it with Pongo's schema system and the Architecture as Code concept.
Read MIGRATION_UNIFICATION_PLAN.md, index.ts
Now let me understand the question better by looking at some examples and clarifying a few points. I can see:
Dumbo's migration unification plan - A comprehensive system for managing database schemas with migrations, snapshots, and TypeScript definitions
Pongo's schema system - A higher-level abstraction focused on MongoDB-like collections within databases
Emmett Architecture as Code - A C4-model-inspired system for defining components, containers, and systems with ports and relationships
The user is asking about how to integrate these three concepts, specifically:
How to connect Dumbo's schema components with Pongo's database/collection abstractions
How to fit this into the Emmett Architecture as Code model
How to make it explicit when features span multiple schemas or databases
Dealing with the fact that Pongo can be "database or database per database schema"
Let me search for more context about event stores and how they're currently used:
Globpattern: "**/event*store*schema*.ts"
⎿
Found 1 file
Grep "eventStoreSchema|event.*store.*component"
⎿
1 line of output
Grep "databaseFeature|schemaFeature"
⎿
1 line of output
Let me look for how dumbo schema components are currently structured:
Read dumboSchema.ts
Globpattern: "**/examples/**/*.ts"
⎿
Found 1 file
Now I have a comprehensive understanding. Let me analyze the integration challenge and provide recommendations. The question involves several complex integration points:
Dumbo schema components - Low-level SQL schema definition with migrations
Pongo schema - MongoDB-like abstraction over SQL databases
Emmett Architecture as Code - C4-model components with ports and relationships
Physical deployment - Different database schemas or databases
Let me formulate my recommendations:
Claude’s Plan
Integration Plan: Dumbo + Pongo + Emmett Architecture as Code
Context Analysis
After reviewing the migration plan and existing code, I see three layers that need integration:
Dumbo Layer: Low-level database schema with SQL migrations (database → schema → table → column)
Pongo Layer: MongoDB-like abstraction (client → db → collection)
Emmett Layer: C4-model architecture components with ports/relationships
Key Challenge: "Pongo can be database OR database-per-schema"
This is the critical mapping issue:
PostgreSQL mode: One database, multiple schemas → Each Pongo DB maps to a PostgreSQL schema
SQLite mode: One database, no schema support → Each Pongo DB is just a logical grouping
Multi-tenant mode: Multiple databases → Each Pongo DB maps to a separate physical database
Recommended Architecture
1. Introduce databaseFeatureComponent
This bridges Dumbo's physical schema and Emmett's logical components:
export type DatabaseFeatureComponent<
NestedComponents extends Record<string, EmmettComponent<any>> | undefined = undefined,
Requires extends PortRequirements | undefined = undefined,
Exposes extends PortRequirements | undefined = undefined,
> = EmmettComponent<NestedComponents, Requires, Exposes> & {
// Physical database mapping
deployment: {
  mode: 'database' | 'schema' | 'collection-prefix';
  database?: string;  // Physical database name
  schema?: string;    // PostgreSQL schema name
  prefix?: string;    // For collection prefixing in shared DB
};

// Dumbo schema definition
dumboSchema: DatabaseSchemaComponent | DatabaseSchemaSchemaComponent;

// Pongo schema definition
pongoSchema: PongoDbSchema;
};
2. Event Store Example Integration
const eventStoreFeature = emmettArch.component('event-store', {
components: {
  streams: emmettArch.component('streams-table'),
  messages: emmettArch.component('messages-table'),
  subscriptions: emmettArch.component('subscriptions-table'),
  appendToStream: emmettArch.component('append-to-stream-function'),
},
ports: {
  exposes: {
    commands: {
      appendToStream: (/* ... */) => Promise.resolve(),
    },
    queries: {
      readStream: (/* ... */) => Promise.resolve([]),
    },
  },
},
deployment: {
  mode: 'schema',
  database: 'main_db',
  schema: 'event_store',
},
dumboSchema: dumboDatabaseSchema('event_store', {
  streams: dumboTable('streams', { /* ... */ }),
  messages: dumboTable('messages', { /* ... */ }),
  subscriptions: dumboTable('subscriptions', { /* ... */ }),
}),
pongoSchema: pongoSchema.db('event_store', {
  streams: pongoSchema.collection('streams'),
  messages: pongoSchema.collection('messages'),
  subscriptions: pongoSchema.collection('subscriptions'),
}),
});
3. Multi-Schema Container
For your hotel management example with separate schemas:
const hotelManagementContainer = emmettArch.container('hotel-management', {
// Event store in dedicated schema
eventStore: databaseFeatureComponent('event-store', {
  deployment: { mode: 'schema', schema: 'event_store' },
  dumboSchema: eventStoreDumboSchema,
  pongoSchema: eventStorePongoSchema,
}),

// Read models in another schema
readModels: databaseFeatureComponent('read-models', {
  deployment: { mode: 'schema', schema: 'read_models' },
  dumboSchema: readModelsDumboSchema,
  pongoSchema: readModelsPongoSchema,
  components: {
    guests: emmettArch.component('guests'),
    reservations: emmettArch.component('reservations'),
  },
}),
});
4. Type-Safe Schema Navigation
Add helper to navigate from Emmett component to its schemas:
export const getComponentSchemas = <T extends DatabaseFeatureComponent>(
component: T
) => ({
dumbo: component.dumboSchema,
pongo: component.pongoSchema,
deployment: component.deployment,

// Get fully qualified table names
tables: () => {
  const { mode, database, schema, prefix } = component.deployment;
  // Return table references with correct qualifiers
},
});
5. Migration Integration
The orchestrator should understand deployment modes:
export class MultiTenantMigrationOrchestrator {
async deployFeature(feature: DatabaseFeatureComponent) {
  const { mode, database, schema } = feature.deployment;

  switch (mode) {
    case 'database':
      // Deploy to separate database
      await this.migrateDatabase(database!, feature.dumboSchema);
      break;
    case 'schema':
      // Deploy to schema within database
      await this.migrateSchema(database!, schema!, feature.dumboSchema);
      break;
    case 'collection-prefix':
      // Just prefix collections, no migration needed
      break;
  }
}
}
Questions for Clarification
Naming: Should we call it databaseFeatureComponent or dataStoreComponent or persistenceComponent?
Nested features: If a feature has multiple schemas (e.g., event_store + projections), should each be a separate component or nested?
Cross-schema relationships: How should we express that read models depend on event store when they're in different schemas?
Collection prefixing: Should we support a "prefix" mode where multiple features share a schema but use prefixed collections?
Function/procedure components: Should stored procedures be first-class components or just part of table components?
Next Steps
Define DatabaseFeatureComponent type with deployment metadata
Extend Emmett arch builder with .databaseFeature() method
Create mapping helpers between Dumbo/Pongo/Emmett schemas
Update migration orchestrator to handle deployment modes
Add examples showing event store + read models in separate schemas
Stayed in plan mode
No, event store schema component should define all on their own. Potentially it can take pongoSchema or dumboSchema for inline projections. Read https://event-driven.io/en/emmett_projections_testing/

PongoSchema defines collections like mongo db, not eventstroe read: https://event-driven.io/en/pongo_strongly_typed_client/

I'd likesomeone to need to define all dumboSchema, pongo Schema etc. I'd like to be able to either wrap dumbo schema, or be able to pass those features to tell, e.g. like we have tables then including event store. or pongo collection.

The obvious option is to include dumbodatabase schema into event store and pongoschema and build it with wrappers, but I'd like to avoid it if possible to just compose it as other schemaComponents
Ah, I understand much better now! Let me re-read those articles and rethink this.
Web Fetchhttps://event-driven.io/en/emmett_projections_testing/
Fetched from https://event-driven.io/en/emmett_projections_testing/
Web Fetchhttps://event-driven.io/en/pongo_strongly_typed_client/
Fetched from https://event-driven.io/en/pongo_strongly_typed_client/
Let me search for event store and projection examples in the codebase:
Grep "inline.*projection|projection.*inline"
⎿
1 line of output
Grep "eventStore|event-store|EventStore"
⎿
2 lines of output
Globpattern: "**/emmett**/projection*.ts"
⎿
Found 1 file
Grep "class.*EventStore|function.*eventStore|const.*eventStore"
⎿
1 line of output
Globpattern: "**/eventStore*.ts"
⎿
Found 1 file
Globpattern: "**/event-store*.ts"
⎿
Found 1 file
Let me look at the schema component structure to understand how components compose:
Read schemaComponent.ts, tableSchemaComponent.ts
If you don't know something then ask, don't hallucinate. I provided you a lot. Event Store is in emmett, not in this repo, that's why I've sent you code samples and articles...
If you need some more definition please ask.
Perfect! Now I understand the pattern. Let me think through what you're asking: Your key insights:
Event store should define its own schema components (tables, functions, etc.)
Pongo schema is for MongoDB-like collections, NOT for event store
You want to compose features like event store AS schema components, not wrap them
You want to avoid having to define dumbo/pongo schemas separately inside each feature
The pattern I see:
TableSchemaComponent extends SchemaComponent with table-specific data
It can be added to a DatabaseSchemaSchemaComponent as a component
You want something similar for "event store" or "pongo collections"
Let me propose a solution based on this understanding:
Proposed Solution: Feature Schema Components
1. EventStoreSchemaComponent (Dumbo side)
export type EventStoreURNType = 'sc:dumbo:event_store';
export type EventStoreURN = `${EventStoreURNType}:${string}`;

export type EventStoreSchemaComponent = SchemaComponent<
EventStoreURN,
Readonly<{
  eventStoreName: string;
  tables: ReadonlyMap<string, TableSchemaComponent>;
  functions: ReadonlyMap<string, FunctionSchemaComponent>;
}>
>;

export const eventStoreSchemaComponent = ({
eventStoreName,
...options
}: {
eventStoreName: string;
} & SchemaComponentOptions): EventStoreSchemaComponent => {
// Define the event store tables
const streamsTable = tableSchemaComponent({
  tableName: 'streams',
  migrations: [/* SQL for streams table */]
});

const messagesTable = tableSchemaComponent({
  tableName: 'messages',
  migrations: [/* SQL for messages table */]
});

const subscriptionsTable = tableSchemaComponent({
  tableName: 'subscriptions',
  migrations: [/* SQL for subscriptions table */]
});

const appendFunction = functionSchemaComponent({
  functionName: 'emt_append_to_stream',
  migrations: [/* SQL for function */]
});

  const base = schemaComponent(
  `sc:dumbo:event_store:${eventStoreName}` as EventStoreURN,
  {
    migrations: options.migrations ?? [],
    components: [
      streamsTable,
      messagesTable,
      subscriptionsTable,
      appendFunction,
      ...(options.components ?? []),
    ],
  }
);

  return {
  ...base,
  eventStoreName,
  get tables() {
    return mapSchemaComponentsOfType<TableSchemaComponent>(
      base.components,
      'sc:dumbo:table',
      (c) => c.tableName,
    );
  },
  get functions() {
    return mapSchemaComponentsOfType<FunctionSchemaComponent>(
      base.components,
      'sc:dumbo:function',
      (c) => c.functionName,
    );
  },
};
};
2. PongoCollectionSetSchemaComponent (Pongo side)
For Pongo, you'd have a similar component that represents a set of collections:
export type PongoCollectionSetURNType = 'sc:pongo:collection_set';
export type PongoCollectionSetURN = `${PongoCollectionSetURNType}:${string}`;

export type PongoCollectionSetSchemaComponent = SchemaComponent<
PongoCollectionSetURN,
Readonly<{
  name: string;
  pongoSchema: PongoDbSchema;
  collections: ReadonlyMap<string, PongoCollectionSchemaComponent>;
}>
>;

export const pongoCollectionSetSchemaComponent = ({
name,
collections,
...options
}: {
name: string;
collections: Record<string, PongoCollectionSchema>;
} & SchemaComponentOptions): PongoCollectionSetSchemaComponent => {
const pongoDbSchema = pongoSchema.db(collections);

const base = schemaComponent(
  `sc:pongo:collection_set:${name}` as PongoCollectionSetURN,
  {
    migrations: options.migrations ?? [],
    components: options.components ?? [],
  }
);

  return {
  ...base,
  name,
  pongoSchema: pongoDbSchema,
  get collections() {
    // Could map from pongoSchema.collections
    return new Map();
  },
};
};
3. Usage: Composing into DatabaseSchema
// Define event store as a schema component
const eventStore = eventStoreSchemaComponent({
eventStoreName: 'default',
});

// Define read models as Pongo collections wrapped in dumbo tables
const readModelsSchema = dumboDatabaseSchema('read_models', {
guests: dumboTable('guests', {
  columns: {
    id: dumboColumn('id'),
    name: dumboColumn('name'),
  }
}),
reservations: dumboTable('reservations', {
  columns: {
    id: dumboColumn('id'),
    guestId: dumboColumn('guest_id'),
  }
}),
});

// Compose them together
const hotelDatabase = dumboDatabase('hotel', {
event_store: dumboDatabaseSchema('event_store', {
  // Add event store as components! Tables are automatically included
}).addComponent(eventStore),  // <-- Event store adds its tables

read_models: readModelsSchema,
});
Wait, that's still awkward. Let me reconsider...
Better Approach: Event Store IS a DatabaseSchemaSchemaComponent
export const eventStoreSchema = (
schemaName: string = 'event_store',
options?: SchemaComponentOptions
): DatabaseSchemaSchemaComponent => {
return dumboDatabaseSchema(schemaName, {
  streams: dumboTable('streams', {
    migrations: [sqlMigration('create_streams', [streamsTableSQL])],
  }),
  messages: dumboTable('messages', {
    migrations: [sqlMigration('create_messages', [messagesTableSQL])],
  }),
  subscriptions: dumboTable('subscriptions', {
    migrations: [sqlMigration('create_subscriptions', [subscriptionsTableSQL])],
  }),
}, options);
};

// Then you can use it directly:
const hotelDatabase = dumboDatabase('hotel', {
event_store: eventStoreSchema('event_store'),
read_models: dumboDatabaseSchema('read_models', {
  guests: dumboTable('guests', { /* ... */ }),
  reservations: dumboTable('reservations', { /* ... */ }),
}),
});
But you also want inline projections... Let me think about that:
With Inline Projections
export const eventStoreSchema = ({
schemaName = 'event_store',
inlineProjections = {},
...options
}: {
schemaName?: string;
inlineProjections?: Record<string, TableSchemaComponent | PongoCollectionSchema>;
} & SchemaComponentOptions = {}): DatabaseSchemaSchemaComponent => {
const coreEventStoreTables = {
  streams: dumboTable('streams', {
    migrations: [sqlMigration('create_streams', [streamsTableSQL])],
  }),
  messages: dumboTable('messages', {
    migrations: [sqlMigration('create_messages', [messagesTableSQL])],
  }),
  subscriptions: dumboTable('subscriptions', {
    migrations: [sqlMigration('create_subscriptions', [subscriptionsTableSQL])],
  }),
};

// Convert inline projections to dumbo tables if needed
const projectionTables: Record<string, TableSchemaComponent> = {};
for (const [name, projection] of Object.entries(inlineProjections)) {
  if ('tableName' in projection) {
    // It's already a TableSchemaComponent
    projectionTables[name] = projection;
  } else {
    // It's a PongoCollectionSchema, create a table for it
    projectionTables[name] = dumboTable(projection.name, {});
  }
}

return dumboDatabaseSchema(schemaName, {
  ...coreEventStoreTables,
  ...projectionTables,
}, options);
};

// Usage:
const hotelDatabase = dumboDatabase('hotel', {
event_store: eventStoreSchema({
  schemaName: 'event_store',
  inlineProjections: {
    guest_summary: pongoSchema.collection('guest_summary'),
    reservation_summary: dumboTable('reservation_summary', { /* ... */ }),
  },
}),
read_models: dumboDatabaseSchema('read_models', {
  guests: dumboTable('guests', { /* ... */ }),
}),
});
For Emmett Architecture Integration
Now, how does this relate to Emmett components?
const eventStoreComponent = emmettArch.component('event-store', {
ports: {
  exposes: {
    commands: {
      appendToStream: (/* ... */) => Promise.resolve(),
    },
  },
},
});

const guestsComponent = emmettArch.component('guests', {
ports: {
  exposes: {
    queries: {
      getGuestByExternalId: query<string, string>(),
    },
  },
},
});

// The container ties Emmett components to database schemas
const hotelManagementContainer = emmettArch.container('hotel-management', {
// Emmett components
eventStore: eventStoreComponent,
guests: guestsComponent,
reservations: reservationsComponent,
});

// Separately, define the database schema
const hotelDatabaseSchema = dumboDatabase('hotel', {
event_store: eventStoreSchema({ schemaName: 'event_store' }),
read_models: dumboDatabaseSchema('read_models', {
  guests: dumboTable('guests', { /* ... */ }),
  reservations: dumboTable('reservations', { /* ... */ }),
}),
});
But how do we link them?
Key Questions:
Should Emmett components contain schema definitions? Or should they be separate?
Should we have a mapping layer that says "event-store component uses event_store schema"?
Do you want deployment flexibility where the same Emmett component can be deployed to different schemas/databases?
For the "explicit location" problem: Do you want something like:
// Query that knows it's in event_store schema
const streams = database.schema('event_store').table('streams');

// Or from Emmett component perspective
const component = container.components.eventStore;
const schema = getSchemaFor(component); // Returns event_store schema
Let me ask some clarifying questions to nail down the design: Clarifying Questions:
Separation of concerns: Should Emmett components (business logic) be completely separate from dumbo schemas (persistence), or should they reference each other?
Event store as primitive: Should eventStoreSchema() be a first-class schema component type (like dumboTable), or just a factory function that creates a DatabaseSchemaSchemaComponent?
Inline projections: When you say "event store can take pongoSchema for inline projections", do you mean:
a) Event store schema should accept PongoCollectionSchema and convert them to tables
b) Event store runtime should support Pongo query API on projection tables
c) Both?
Multi-schema deployment: If you have event_store in one schema and read_models in another, how should the Emmett component know which schema to query? Should there be a deployment config that maps components to schemas?
Function/Stored Procedures: Should SQL functions (like emt_append_to_stream) be first-class schema components, or just part of table/schema migrations?
Please clarify these points so I can provide the right solution!
You're absolutely right - I apologize for making assumptions. Let me ask clarifying questions based on what you've actually provided:
Clarifying Questions
Based on the code samples you provided and the migration plan, I need to understand:
1. Event Store Structure
From your SQL example, I can see the event store has:
Tables: streams, messages, subscriptions
Functions: emt_append_to_stream (PostgreSQL stored procedure)
These are defined via raw SQL (streamsTableSQL, messagesTableSQL, etc.)
Question: Should event store be represented as:
Option A: A factory function that returns a DatabaseSchemaSchemaComponent with all tables pre-configured?
const eventStore = eventStoreSchema('event_store'); // Returns DatabaseSchemaSchemaComponent
Option B: A new schema component type (like EventStoreSchemaComponent extends SchemaComponent)?
Option C: Just a collection of table components that you manually compose?
2. Inline Projections
You mentioned "event store can take pongoSchema or dumboSchema for inline projections" Question: What does this mean in practice?
Do inline projections create additional tables in the same schema as the event store?
Should I be able to do something like:
const eventStore = eventStoreSchema('event_store', {
inlineProjections: {
  guestSummary: pongoSchema.collection('guest_summary'),
  // This creates a 'guest_summary' table in the event_store schema?
}
});
3. Pongo vs Dumbo Relationship
From pongo/src/core/schema/index.ts:
Pongo schema defines client -> db -> collections (MongoDB-like)
It's a logical abstraction over the physical database
From the migration plan:
Dumbo schema defines database -> schema -> table -> column (SQL)
It's the physical structure with migrations
Question: How should these relate?
Can a single Pongo db map to multiple Dumbo schemas?
If I have event_store in one schema and read_models in another, do I create:
Two separate Pongo dbs?
One Pongo db that somehow spans both schemas?
4. Stored Procedures / Functions
Your emt_append_to_stream example is a PostgreSQL function. Question: Should functions be:
Option A: Part of table migrations (stored in table component)?
Option B: A new FunctionSchemaComponent type (like TableSchemaComponent)?
Option C: Part of schema-level migrations (stored in DatabaseSchemaSchemaComponent)?
5. Emmett Component Integration
You showed Emmett Architecture as Code with components, containers, ports. Question: What's the relationship between:
Emmett component (business logic with ports)
Dumbo DatabaseSchemaSchemaComponent (physical schema)
Pongo PongoDbSchema (logical collections)
Should they:
Option A: Be completely separate (define them independently, link via configuration)?
Option B: Have explicit references (Emmett component has .schema property)?
Option C: Use a mapping/registry pattern?
6. Multiple Schemas in One Database
Your question mentions "pongo database could be either database or database per database schema" Question: Can you explain this with a concrete example?
// Scenario 1: PostgreSQL with multiple schemas
const db = pongoClient.db('hotel'); // Maps to PostgreSQL database 'hotel'
// This database has schemas: event_store, read_models, analytics

// Scenario 2: SQLite (no schemas)
const db = pongoClient.db('hotel'); // Maps to SQLite database 'hotel'
// No schema concept, all tables in one namespace

// How should the schema definition work for both?
7. "Explicit Location" Requirement
You said: "How to make it explicit that we're adding feature that can have multiple types of components but also be able to locate it in the specific schema or database?" Question: What does "locate it" mean?
At definition time: "This feature's tables go in schema X"?
At runtime: "Query this component and know which schema it's in"?
At architecture documentation time: "Show which schema each component uses"?
8. Composition Pattern
You said: "I'd like to just compose it as other schemaComponents" Question: What does the ideal composition look like to you?
// Example A: Flat composition
const hotelDb = dumboDatabase('hotel', {
event_store: eventStoreSchema(),
read_models: readModelsSchema(),
});

// Example B: Nested composition
const hotelDb = dumboDatabase('hotel')
.addSchema(eventStoreSchema())
.addSchema(readModelsSchema());

// Example C: Component-based
const hotelDb = dumboDatabase('hotel', {
features: {
  eventStore: eventStoreFeature, // This internally creates schemas
  readModels: readModelsFeature,
}
});
Please clarify these points and I'll design the right solution based on what you actually need, not assumptions!
Thank you for your patience. Let me ask the essential questions I need to understand your requirements:
Essential Questions
1. Event Store Package Location & API
You mentioned "Event Store is in emmett, not in this repo" and provided SQL samples. Question: In the Emmett package, does the event store:
Export a function/class that creates the schema definition?
Provide just the SQL strings (like your streamsTableSQL, messagesTableSQL examples)?
Provide a complete schema component I can import and use?
What I need to know: If I want to use event store in this codebase, what exactly do I import from Emmett and how do I turn it into a Dumbo schema component?
2. The Core Integration Problem
You want to avoid wrapping dumbo/pongo schemas inside feature definitions, but still compose them. Question: Starting from your event store SQL example with streams, messages, subscriptions tables and the emt_append_to_stream function - if I want to:
Use this as a Dumbo schema component (for migrations)
Also expose it as a Pongo schema (for querying)
Include it in an Emmett architecture component (for documentation/ports)
Deploy it to a specific PostgreSQL schema (e.g., event_store schema)
What should the code look like? Can you show me a pseudocode example of how you envision defining this?
3. Inline Projections Clarification
You said event store "can take pongoSchema or dumboSchema for inline projections" Question: When you define an inline projection:
// Pseudocode - is this the right direction?
eventStore({
inlineProjections: {
  guestSummary: ??? // What goes here?
}
})
Does guestSummary become a table in the same PostgreSQL schema as streams/messages?
Is it a Pongo collection definition that gets converted to a table?
Is it a Dumbo table definition?
Something else?
4. Physical Deployment Mapping
Regarding "pongo database could be either database or database per database schema": Question: In these two scenarios, how should the schemas be defined? Scenario A - PostgreSQL (one DB, multiple schemas):
-- Physical structure:
-- Database: hotel_db
--   Schema: event_store (tables: streams, messages, subscriptions)
--   Schema: read_models (tables: guests, reservations)
Scenario B - SQLite (one DB, no schema support):
-- Physical structure:
-- Database: hotel.db
--   Tables: streams, messages, subscriptions, guests, reservations
Should the Dumbo/Pongo schema definition be:
The same for both, with deployment config handling the difference?
Different for each database type?
Something else?
5. Function/Stored Procedure Components
Your emt_append_to_stream example is a PostgreSQL function. Question: Should I create a new FunctionSchemaComponent type (similar to TableSchemaComponent), or should functions just be SQL migrations attached to schema/table components? If you want FunctionSchemaComponent, should it be:
const appendFunction = dumboFunction('emt_append_to_stream', {
migrations: [sqlMigration('create_append', [appendToStreamSQL])],
});

// Then added to schema
const eventStoreSchema = dumboDatabaseSchema('event_store', {
tables: { streams, messages, subscriptions },
functions: { appendToStream: appendFunction }, // ???
});
6. Emmett Component Connection
Looking at your Emmett Architecture example with emmettArch.component(), emmettArch.container(): Question: Should Emmett components:
Option A: Have no knowledge of Dumbo/Pongo schemas (purely architectural documentation)?
Option B: Reference which schema they use (e.g., eventStoreComponent.schema = eventStoreDumboSchema)?
Option C: Be created FROM schema definitions (e.g., emmettArch.component.fromSchema(eventStoreDumboSchema))?
7. Concrete Use Case
Can you provide a concrete example of what you want to build? For instance:
// I want to define:
// 1. Event store in its own PostgreSQL schema
// 2. Guest read model in another schema
// 3. Both accessible via Pongo API
// 4. Both documented in Emmett architecture
// 5. The event store should have an inline projection for guest summaries

// What should this code look like?
const ??? = ???
If you can show me the desired API/syntax you want to write, I can design the implementation to support it.
Please answer whichever questions are relevant to clarify your vision. I want to understand what you're trying to achieve before proposing a solution.
I don't like thaat as some just want to keep event store in the same schema as read model.

The idea in general is to be able to also run migration together for database that contain both event store and read modls. And yes, by default I don't want user to know internal structure of event store, same for pongo collections. they should be opaque, but in the future give some customisation.
Ah! Now I understand much better. Let me clarify what I'm hearing:
What I Understand Now
Flexibility in deployment: Event store and read models can be in:
Same schema (simpler deployments)
Different schemas (separation of concerns)
User's choice, not forced
Opaque internals: Users shouldn't need to know that event store has streams, messages, subscriptions tables - that's an implementation detail
Run migrations together: Whether event store is in the same schema or different, migrations should run together as one cohesive database setup
Future customization: Later, allow power users to customize event store internals, but not required
Key Question: What Does the API Look Like?
Let me propose what I think you want and you tell me if I'm on the right track:
Scenario 1: Event Store + Read Models in SAME schema
// User just wants everything in 'public' schema
const hotelDb = dumboDatabase('hotel', {
public: dumboDatabaseSchema('public', {
  // Event store tables are added transparently
  ...eventStoreSchemaComponents(), // Returns { streams: table, messages: table, ... }

  // User's read model tables
  guests: dumboTable('guests', { /* ... */ }),
  reservations: dumboTable('reservations', { /* ... */ }),
})
});
Scenario 2: Event Store + Read Models in DIFFERENT schemas
// User wants separation
const hotelDb = dumboDatabase('hotel', {
event_store: eventStoreSchema('event_store'), // Opaque, returns DatabaseSchemaSchemaComponent

read_models: dumboDatabaseSchema('read_models', {
  guests: dumboTable('guests', { /* ... */ }),
  reservations: dumboTable('reservations', { /* ... */ }),
})
});
Scenario 3: With Inline Projections
const hotelDb = dumboDatabase('hotel', {
event_store: eventStoreSchema('event_store', {
  // Inline projections become tables in the SAME schema as event store
  inlineProjections: {
    guest_summary: pongoSchema.collection('guest_summary'), // Creates guest_summary table
  }
}),

read_models: dumboDatabaseSchema('read_models', {
  guests: dumboTable('guests', { /* ... */ }),
})
});
Critical Questions:
Q1: Event Store Schema Component API
Should eventStoreSchema() return a DatabaseSchemaSchemaComponent that contains all the tables internally?
// Option A: Opaque schema component
export const eventStoreSchema = (
schemaName: string,
options?: { inlineProjections?: Record<string, PongoCollectionSchema> }
): DatabaseSchemaSchemaComponent => {
// Internally creates streams, messages, subscriptions tables
// User doesn't see them
};

// Option B: Spread/merge pattern
export const eventStoreSchemaComponents = (): Record<string, TableSchemaComponent> => ({
streams: dumboTable('streams', { migrations: [streamsSQL] }),
messages: dumboTable('messages', { migrations: [messagesSQL] }),
subscriptions: dumboTable('subscriptions', { migrations: [subscriptionsSQL] }),
});
Which pattern do you prefer?
Q2: Pongo Schema Relationship
If event store and read models are in the same schema, how does Pongo schema map?
// If both in 'public' schema:
const pongoDb = pongoSchema.db('hotel', {
// Do we expose event store collections?
streams: pongoSchema.collection('streams'), // ???
messages: pongoSchema.collection('messages'), // ???

// Or only read models?
guests: pongoSchema.collection('guests'),
reservations: pongoSchema.collection('reservations'),
});
Should event store tables be exposed via Pongo, or hidden?
Q3: Migration Composition
When running migrations, should event store migrations:
Be part of the normal migration flow (just more tables)?
Run separately/first (event store setup, then read models)?
Be configurable?
Q4: Stored Functions
The emt_append_to_stream PostgreSQL function - should it be:
// Option A: Part of schema migrations
const eventStoreSchema = (schemaName: string) =>
dumboDatabaseSchema(schemaName, {
  streams: dumboTable('streams', { /* ... */ }),
  messages: dumboTable('messages', { /* ... */ }),
}, {
  migrations: [
    sqlMigration('create_functions', [appendToStreamSQL])
  ]
});

// Option B: First-class function component
const eventStoreSchema = (schemaName: string) =>
dumboDatabaseSchema(schemaName, {
  streams: dumboTable('streams', { /* ... */ }),
  appendToStream: dumboFunction('emt_append_to_stream', { /* ... */ }),
});
Which approach?
Please tell me:
Which API scenarios (1, 2, 3 above) match what you want?
Which of the options for each question is closer to your vision?
Any corrections to my understanding?
This will help me propose the right design!
I don't like this  ...eventStoreSchemaComponents(),  - I'd prefer to just use eventStoreSchema(), which could take also inline projection with references to pongo collection, still, pongo collection could be also define inside schema just like we do for table, and pongoDatabase both as database and schema.

We should be able to make eventStoreSchema and pongo related shcemas to extend some base feature schema component, and then detect it, right or not?
YES! Now I get it! Let me confirm my understanding:
What You Want
1. Event Store as Opaque Component
// User just uses it, doesn't see internal tables
const hotelDb = dumboDatabase('hotel', {
public: dumboDatabaseSchema('public', {
  eventStore: eventStoreSchema(), // NOT spreading, just add it as a component
  guests: dumboTable('guests', { /* ... */ }),
  reservations: dumboTable('reservations', { /* ... */ }),
})
});
2. Feature Schema Component Pattern
// Base type that event store, pongo collections, etc. extend
export type FeatureSchemaComponent = SchemaComponent<
string,
{
  featureType: 'event_store' | 'pongo_collections' | 'custom';
}
>;

// Event store extends this
export type EventStoreSchemaComponent = SchemaComponent<
'sc:dumbo:event_store',
{
  featureType: 'event_store';
  eventStoreName: string;
  // Internal: tables, functions - user doesn't see
  internalTables: Map<string, TableSchemaComponent>;
}
>;

// Pongo collection set extends this
export type PongoCollectionSetSchemaComponent = SchemaComponent<
'sc:dumbo:pongo_collections',
{
  featureType: 'pongo_collections';
  pongoSchema: PongoDbSchema;
}
>;
3. Detection & Composition
// When adding to schema, detect what type it is
dumboDatabaseSchema('public', {
// This is detected as EventStoreSchemaComponent
eventStore: eventStoreSchema(),

// This is detected as TableSchemaComponent
guests: dumboTable('guests', { /* ... */ }),

// This is detected as PongoCollectionSetSchemaComponent
readModels: pongoCollectionsSchema({
  guests: pongoSchema.collection('guests'),
  reservations: pongoSchema.collection('reservations'),
}),
});
4. Inline Projections with Pongo Collections
const hotelDb = dumboDatabase('hotel', {
event_store: dumboDatabaseSchema('event_store', {
  // Event store with inline projections
  eventStore: eventStoreSchema({
    inlineProjections: {
      // Reference to pongo collection - creates table automatically
      guestSummary: pongoSchema.collection('guest_summary'),
    }
  }),
}),

read_models: dumboDatabaseSchema('read_models', {
  // Or define pongo collections directly in schema
  readModels: pongoCollectionsSchema({
    guests: pongoSchema.collection('guests'),
    reservations: pongoSchema.collection('reservations'),
  }),
}),
});
Key Questions to Confirm:
Q1: Feature Schema Component Base
Should there be a common base or marker for "feature components" that:
Contain multiple internal components (tables, functions, etc.)
Can be detected via isSchemaComponentOfType(comp, 'feature') or similar
Are opaque (internal structure hidden from user)
export const isFeatureSchemaComponent = (comp: AnySchemaComponent): boolean => {
return comp.schemaComponentKey.startsWith('sc:dumbo:feature:');
};
Q2: Pongo Collections as Schema Component
Should pongoCollectionsSchema() create tables automatically?
// This creates:
// - A schema component
// - Dumbo tables for each collection (for migrations)
// - Pongo schema for querying
const readModels = pongoCollectionsSchema({
guests: pongoSchema.collection('guests'),
reservations: pongoSchema.collection('reservations'),
});

// Internally generates:
// - dumboTable('guests', {})
// - dumboTable('reservations', {})
// - pongoSchema.db({ guests, reservations })
Is this correct?
Q3: Same Schema Flexibility
All of these should work, right?
// A: Everything in one schema
dumboDatabase('hotel', {
public: dumboDatabaseSchema('public', {
  eventStore: eventStoreSchema(),
  guests: dumboTable('guests', {}),
})
});

// B: Separated schemas
dumboDatabase('hotel', {
event_store: dumboDatabaseSchema('event_store', {
  eventStore: eventStoreSchema(),
}),
read_models: dumboDatabaseSchema('read_models', {
  guests: dumboTable('guests', {}),
})
});

// C: Event store + pongo collections in same schema
dumboDatabase('hotel', {
public: dumboDatabaseSchema('public', {
  eventStore: eventStoreSchema(),
  readModels: pongoCollectionsSchema({
    guests: pongoSchema.collection('guests'),
  }),
})
});
Q4: Detection in Migration Orchestrator
When collecting migrations, detect feature components:
// In migration orchestrator
for (const component of schema.components.values()) {
if (isEventStoreComponent(component)) {
  // Handle event store migrations specially if needed
} else if (isPongoCollectionsComponent(component)) {
  // Generate table migrations from pongo collections
} else if (isTableComponent(component)) {
  // Standard table migration
}
}
Is this the right approach?
Am I understanding correctly now? The key insight is:
Feature components (event store, pongo collections) are first-class schema components
They compose like tables do
They're detected by type checking
They encapsulate internal structure
Should I proceed with this design?
For user feature should be opaque, they don't need to know how sausages are made, still, they should be visible later in generated typed system and added to the dumbo schema definition so they're strongly typed and also that migrations works fine.

Ad q3.

A looks weird as it suggests that eventStore is table, which is not.
For user feature should be opaque, they don't need to know how sausages are made, still, they should be visible later in generated typed system and added to the dumbo schema definition so they're strongly typed and also that migrations works fine.

Ad q3.

A looks weird as it suggests that eventStore is table, which is not.
Perfect! This clarifies a lot. Let me refine my understanding:
Key Insights
1. Feature Components are NOT Tables
You're right - in scenario A, putting eventStore: eventStoreSchema() alongside tables is confusing because it's not a table. Better API:
// Option A-revised: Feature at schema level
const hotelDb = dumboDatabase('hotel', {
public: dumboDatabaseSchema('public', {
  features: {
    eventStore: eventStoreSchema(),
  },
  tables: {
    guests: dumboTable('guests', {}),
    reservations: dumboTable('reservations', {}),
  }
})
});

// OR Option A-alternative: Feature creates its own implicit schema content
const hotelDb = dumboDatabase('hotel', {
public: dumboDatabaseSchema('public')
  .withFeature(eventStoreSchema())
  .withTable(dumboTable('guests', {}))
});

// OR Option A-simpler: Features and tables mixed but clearly typed
const hotelDb = dumboDatabase('hotel', {
public: dumboDatabaseSchema('public', {
  eventStore: eventStoreSchema(), // Type system knows this is FeatureSchemaComponent
  guests: dumboTable('guests', {}), // Type system knows this is TableSchemaComponent
})
});
Question: Which API feels right to you? I'm leaning toward the last one (A-simpler) because:
Type system prevents confusion
Simpler API
Components compose uniformly
2. Strongly Typed Generated System
You want the generated types to expose the feature's tables:
// After running schema generation from:
const hotelDb = dumboDatabase('hotel', {
public: dumboDatabaseSchema('public', {
  eventStore: eventStoreSchema(),
  guests: dumboTable('guests', {}),
})
});

// Generated types should include:
export type HotelSchema = {
public: {
  // Event store tables exposed (even though user didn't define them)
  streams: { stream_id: string, stream_position: number, ... },
  messages: { stream_id: string, message_data: unknown, ... },
  subscriptions: { subscription_id: string, ... },

  // User's tables
  guests: { id: string, name: string, ... },
}
};
Question: Should the generated types expose event store internals, or keep them hidden?
3. Pongo Schema Generation
For Pongo collections defined via pongoCollectionsSchema():
const hotelDb = dumboDatabase('hotel', {
read_models: dumboDatabaseSchema('read_models', {
  collections: pongoCollectionsSchema({
    guests: pongoSchema.collection('guests'),
    reservations: pongoSchema.collection('reservations'),
  }),
})
});

// Should generate:
// 1. Dumbo tables: guests, reservations
// 2. Pongo schema: PongoDbSchema with those collections
// 3. Migrations: CREATE TABLE for each collection
Proposed Architecture
Feature Schema Component Base
// Marker interface
export type FeatureSchemaComponent<
URN extends string = string,
AdditionalData extends Record<string, unknown> = Record<string, unknown>
> = SchemaComponent<URN, AdditionalData & {
__featureMarker: true;
internalComponents: ReadonlyMap<string, SchemaComponent>; // Hidden from user
}>;

// Type guard
export const isFeatureSchemaComponent = (
comp: AnySchemaComponent
): comp is FeatureSchemaComponent => {
return '__featureMarker' in comp && comp.__featureMarker === true;
};
Event Store Schema Component
export type EventStoreSchemaComponent = FeatureSchemaComponent<
'sc:dumbo:feature:event_store',
{
  eventStoreName?: string;
  inlineProjections?: Record<string, PongoCollectionSchema>;
}
>;

export const eventStoreSchema = (
options?: {
  inlineProjections?: Record<string, PongoCollectionSchema>;
}
): EventStoreSchemaComponent => {
// Create internal tables
const streams = dumboTable('streams', {
  migrations: [sqlMigration('create_streams', [streamsTableSQL])]
});
const messages = dumboTable('messages', {
  migrations: [sqlMigration('create_messages', [messagesTableSQL])]
});
const subscriptions = dumboTable('subscriptions', {
  migrations: [sqlMigration('create_subscriptions', [subscriptionsTableSQL])]
});

// Handle inline projections
const projectionTables = Object.entries(options?.inlineProjections ?? {}).map(
  ([name, collectionSchema]) => dumboTable(collectionSchema.name, {})
);

const allComponents = [streams, messages, subscriptions, ...projectionTables];

const base = schemaComponent('sc:dumbo:feature:event_store', {
  components: allComponents,
});

return {
  ...base,
  __featureMarker: true as const,
  eventStoreName: 'event_store',
  inlineProjections: options?.inlineProjections,
  internalComponents: new Map(allComponents.map(c => [c.schemaComponentKey, c])),
};
};
Pongo Collections Schema Component
export type PongoCollectionsSchemaComponent = FeatureSchemaComponent<
'sc:dumbo:feature:pongo_collections',
{
  pongoSchema: PongoDbSchema;
}
>;

export const pongoCollectionsSchema = (
collections: Record<string, PongoCollectionSchema>
): PongoCollectionsSchemaComponent => {
// Create dumbo table for each pongo collection
const tables = Object.entries(collections).map(([_name, collectionSchema]) =>
  dumboTable(collectionSchema.name, {
    // Auto-generate basic table structure for Pongo
    // Could add _id, document JSONB columns, etc.
  })
);

const base = schemaComponent('sc:dumbo:feature:pongo_collections', {
  components: tables,
});

return {
  ...base,
  __featureMarker: true as const,
  pongoSchema: pongoSchema.db(collections),
  internalComponents: new Map(tables.map(t => [t.schemaComponentKey, t])),
};
};
Migration Collection
// In migration orchestrator
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
        }
      }
    } else if (isTableComponent(component)) {
      // Regular table
      migrations.push(...component.migrations);
    }
  }
}

return migrations;
};
Final Clarifying Questions
Q1: Component Placement
Which feels most natural?
// A: Mixed (type system differentiates)
dumboDatabaseSchema('public', {
eventStore: eventStoreSchema(),
guests: dumboTable('guests', {}),
})

// B: Separated
dumboDatabaseSchema('public', {
features: { eventStore: eventStoreSchema() },
tables: { guests: dumboTable('guests', {}) },
})

// C: Builder pattern
dumboDatabaseSchema('public')
.withFeature(eventStoreSchema())
.withTable(dumboTable('guests', {}))
Q2: Generated Types Visibility
Should generated types expose event store internals?
// Option A: Expose everything
type Schema = {
public: {
  streams: { ... },  // From event store
  messages: { ... }, // From event store
  guests: { ... },   // From user
}
}

// Option B: Keep features opaque
type Schema = {
public: {
  guests: { ... },   // Only user-defined tables
}
}
Q3: Pongo Collections Table Structure
When pongoCollectionsSchema() creates tables, what should the table structure be?
// Option A: Document store (MongoDB-like)
CREATE TABLE guests (
_id TEXT PRIMARY KEY,
document JSONB NOT NULL
)

// Option B: Let user define structure
pongoCollectionsSchema({
guests: pongoSchema.collection('guests', {
  tableDefinition: dumboTable('guests', {
    columns: { id, name, email, ... }
  })
})
})

// Option C: Infer from Pongo usage later
Please confirm these choices and I'll build the complete solution!
$$
