import assert from 'node:assert';
import { describe, expectTypeOf, it } from 'vitest';
import { SQL } from '../sql';
import {
  SchemaComponentMigrator,
  assertLogicalSchemaMapping,
  columnSchemaComponent,
  databaseComponent,
  databaseComponentType,
  databaseSchemaComponent,
  databaseSchemaComponentType,
  extensionComponent,
  extensionComponentType,
  findComponent,
  findComponents,
  generatedIndexName,
  genericComponentType,
  indexComponent,
  indexComponentType,
  isExtensionComponent,
  isTableComponent,
  schemaComponent,
  schemaComponentType,
  sqlMigration,
  tableComponent,
  tableComponentType,
  type AnySchemaComponent,
  type DatabaseComponent,
  type DatabaseSchemaComponent,
  type ExtensionComponent,
  type IndexComponent,
  type TableComponent,
} from './index';

const extensionWith = (
  extensionName: string,
  components: Readonly<Record<string, AnySchemaComponent>> = {},
  migrations: ReturnType<typeof sqlMigration>[] = [],
): ExtensionComponent =>
  extensionComponent(extensionName, components, { migrations });

const findExtensions = (root: AnySchemaComponent): ExtensionComponent[] =>
  findComponents(root, isExtensionComponent);

describe('composing schema components', () => {
  it('identifies every component kind without relying on string keys', () => {
    expectTypeOf<DatabaseComponent>().toHaveProperty('schemas');
    expectTypeOf<DatabaseSchemaComponent>().toHaveProperty('tables');
    expectTypeOf<TableComponent>().toHaveProperty('indexes');
    expectTypeOf<IndexComponent>().toHaveProperty('indexName');

    assert.strictEqual(
      databaseComponent({ databaseName: 'app' })[schemaComponentType],
      databaseComponentType,
    );
    assert.strictEqual(
      databaseSchemaComponent({ schemaName: 'public' })[schemaComponentType],
      databaseSchemaComponentType,
    );
    assert.strictEqual(
      tableComponent({ tableName: 'users' })[schemaComponentType],
      tableComponentType,
    );
    assert.strictEqual(
      indexComponent({
        indexName: 'users_email_idx',
        columnNames: ['email'],
        isUnique: false,
      })[schemaComponentType],
      indexComponentType,
    );
  });

  it('runs a parent migration before child migrations in declaration order', () => {
    const rootMigration = sqlMigration('root:001', [SQL`SELECT 0`]);
    const firstMigration = sqlMigration('first:001', [SQL`SELECT 1`]);
    const secondMigration = sqlMigration('second:001', [SQL`SELECT 2`]);
    const root = schemaComponent({
      migrations: [rootMigration],
      components: {
        first: schemaComponent({ migrations: [firstMigration] }),
        second: schemaComponent({ migrations: [secondMigration] }),
      },
    });

    assert.deepStrictEqual(root.migrations, [
      rootMigration,
      firstMigration,
      secondMigration,
    ]);
  });

  it('runs a shared child migration once when the child has multiple aliases', () => {
    const migration = sqlMigration('child:001', [SQL`SELECT 1`]);
    const child = schemaComponent({ migrations: [migration] });
    const root = schemaComponent({
      components: { child, childAgain: child },
    });

    assert.deepStrictEqual(root.migrations, [migration]);
    assert.deepStrictEqual(
      findComponents(
        root,
        (component): component is typeof child => component === child,
      ),
      [child],
    );
  });

  it('rejects two different migrations that would share one ledger identity', () => {
    const root = schemaComponent({
      components: {
        first: schemaComponent({
          migrations: [sqlMigration('duplicate:001', [SQL`SELECT 1`])],
        }),
        second: schemaComponent({
          migrations: [sqlMigration('duplicate:001', [SQL`SELECT 2`])],
        }),
      },
    });

    assert.throws(
      () => root.migrations,
      /Duplicate migration name "duplicate:001"/,
    );
  });

  it('accepts one migration reused by multiple components', () => {
    const migration = sqlMigration('shared:001', [SQL`SELECT 1`]);
    const root = schemaComponent({
      components: {
        first: schemaComponent({ migrations: [migration] }),
        second: schemaComponent({ migrations: [migration] }),
      },
    });

    assert.deepStrictEqual(root.migrations, [migration]);
  });

  it('finds a nested table from a composed root', () => {
    const leaf = tableComponent({ tableName: 'users' });
    const middle = schemaComponent({ components: { leaf } });
    const root = schemaComponent({ components: { middle } });

    assert.deepStrictEqual(findComponents(root, isTableComponent), [leaf]);
    assert.strictEqual(findComponent(root, isTableComponent), leaf);
  });

  it('finishes traversal when reusable components form a cycle', () => {
    const migration = sqlMigration('leaf:001', [SQL`SELECT 1`]);
    const leafChildren = Object.create(null) as Record<
      string,
      AnySchemaComponent
    >;
    const leaf: AnySchemaComponent = {
      [schemaComponentType]: genericComponentType,
      components: leafChildren,
      migrations: [migration],
    };
    const root = schemaComponent({ components: { leaf } });
    leafChildren.root = root;

    assert.deepStrictEqual(
      findComponents(
        root,
        (_component): _component is AnySchemaComponent => true,
      ),
      [root, leaf],
    );
    assert.deepStrictEqual(root.migrations, [migration]);
  });

  it('accesses declared children through typed record aliases', () => {
    const users = tableComponent({ tableName: 'users' });
    const root = schemaComponent({ components: { users } });

    expectTypeOf(root.components.users).toEqualTypeOf(users);
    assert.strictEqual(root.components.users, users);
    assert.deepStrictEqual(Object.keys(root.components), ['users']);
    assert.strictEqual(Object.getPrototypeOf(root.components), null);
  });

  it('accepts domain aliases that overlap collection and object API names', () => {
    const entries = schemaComponent();
    const get = schemaComponent();
    const size = schemaComponent();
    const constructor = schemaComponent();
    const root = schemaComponent({
      components: { entries, get, size, constructor },
    });

    assert.strictEqual(root.components.entries, entries);
    assert.strictEqual(root.components.get, get);
    assert.strictEqual(root.components.size, size);
    assert.strictEqual(root.components.constructor, constructor);
  });

  it('keeps a composed declaration read-only after construction', () => {
    const child = schemaComponent();
    const root = schemaComponent({ components: { child } });

    assert.strictEqual('addComponent' in root, false);
    assert.strictEqual('addMigration' in root, false);
    assert.strictEqual(Object.isFrozen(root.components), true);
    assert.throws(() => {
      (root.components as unknown as Record<string, AnySchemaComponent>).other =
        schemaComponent();
    }, TypeError);
    assert.deepStrictEqual(Object.keys(root.components), ['child']);
  });

  it('composes a frozen child record without changing it', () => {
    const child = schemaComponent();
    const source = Object.freeze({ child });
    const root = schemaComponent({ components: source });

    assert.deepStrictEqual(Object.keys(source), ['child']);
    assert.strictEqual(source.child, child);
    assert.strictEqual(root.components.child, child);
  });
});

describe('grouping components in extensions', () => {
  it('attaches an extension to a database without exposing its internals as schemas', () => {
    const eventStoreSchema = databaseSchemaComponent({
      schemaName: 'event_store',
      tables: {
        events: tableComponent({ tableName: 'events' }),
      },
    });
    const checkpoints = tableComponent({
      tableName: 'processor_checkpoints',
    });
    const eventStore = extensionComponent('event-store', {
      eventStore: eventStoreSchema,
      checkpoints,
    });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { eventStore },
    });

    expectTypeOf(eventStore.components.eventStore).toEqualTypeOf(
      eventStoreSchema,
    );
    expectTypeOf(eventStore.components.checkpoints).toEqualTypeOf(checkpoints);
    assert.strictEqual(eventStore.components.eventStore, eventStoreSchema);
    assert.strictEqual(database.extensions.eventStore, eventStore);
    assert.deepStrictEqual(Object.keys(database.schemas), []);
  });

  it('attaches an extension to a schema without exposing its internals as tables', () => {
    const internalTable = tableComponent({ tableName: 'audit_log' });
    const audit = extensionComponent('audit', { internalTable });
    const schema = databaseSchemaComponent({
      schemaName: 'public',
      extensions: { audit },
    });

    assert.deepStrictEqual(Object.keys(schema.tables), []);
    assert.strictEqual(schema.extensions.audit, audit);
    assert.strictEqual(schema.components.audit, audit);
  });

  it('allows two extension aliases to reference the same component once', () => {
    const migration = sqlMigration('users:001', [SQL`SELECT 1`]);
    const users = tableComponent({
      tableName: 'users',
      migrations: [migration],
    });
    const extension = extensionComponent('shared', {
      users,
      usersAgain: users,
    });

    assert.strictEqual(extension.components.users, users);
    assert.strictEqual(extension.components.usersAgain, users);
    assert.deepStrictEqual(extension.migrations, [migration]);
    assert.deepStrictEqual(findComponents(extension, isTableComponent), [
      users,
    ]);
  });

  it('distinguishes an extension from a table without inspecting names', () => {
    const extension = extensionWith('audit');
    const table = tableComponent({ tableName: 'audit_log' });

    assert.strictEqual(extension[schemaComponentType], extensionComponentType);
    assert.strictEqual(isExtensionComponent(extension), true);
    assert.strictEqual(isExtensionComponent(table), false);
  });

  it('finds tables and extensions nested inside another extension', () => {
    const auditLog = tableComponent({ tableName: 'audit_log' });
    const nested = extensionComponent('nested-audit', { auditLog });
    const audit = extensionComponent('audit', { nested });
    const schema = databaseSchemaComponent({
      schemaName: 'public',
      extensions: { audit },
    });

    assert.deepStrictEqual(findComponents(schema, isTableComponent), [
      auditLog,
    ]);
    assert.deepStrictEqual(findExtensions(schema), [audit, nested]);
  });

  it('accepts the same direct extension-map shape on databases and schemas', () => {
    const eventStore = extensionWith('event-store');
    const audit = extensionWith('audit');
    const schema = databaseSchemaComponent({
      schemaName: 'crm',
      extensions: { audit },
    });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: { crm: schema },
      extensions: { eventStore },
    });

    assert.strictEqual(database.extensions.eventStore, eventStore);
    assert.strictEqual(database.schemas.crm.extensions.audit, audit);
    assert.deepStrictEqual(Object.keys(database.components), [
      'crm',
      'eventStore',
    ]);
  });

  it('runs schema extensions before database extensions in structural order', () => {
    const tableMigration = sqlMigration('table:001', [SQL`SELECT 1`]);
    const schemaExtensionMigration = sqlMigration('schema-extension:001', [
      SQL`SELECT 2`,
    ]);
    const databaseExtensionMigration = sqlMigration('database-extension:001', [
      SQL`SELECT 3`,
    ]);
    const audit = extensionWith('audit', {}, [schemaExtensionMigration]);
    const eventStore = extensionWith('event-store', {}, [
      databaseExtensionMigration,
    ]);
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        crm: databaseSchemaComponent({
          schemaName: 'crm',
          tables: {
            users: tableComponent({
              tableName: 'users',
              migrations: [tableMigration],
            }),
          },
          extensions: { audit },
        }),
      },
      extensions: { eventStore },
    });

    assert.deepStrictEqual(database.migrations, [
      tableMigration,
      schemaExtensionMigration,
      databaseExtensionMigration,
    ]);
  });

  it('behaves the same when migrated directly or from a database root', () => {
    const migration = sqlMigration('audit:001', [SQL`SELECT 1`]);
    const auditLog = tableComponent({
      tableName: 'audit_log',
      migrations: [migration],
    });
    const audit = extensionComponent('audit', { auditLog });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { audit },
    });

    assert.deepStrictEqual(audit.migrations, [migration]);
    assert.deepStrictEqual(database.migrations, [migration]);
    assert.deepStrictEqual(findComponents(audit, isTableComponent), [auditLog]);
    assert.deepStrictEqual(findComponents(database, isTableComponent), [
      auditLog,
    ]);
  });
});

describe('placing reusable declarations in the database hierarchy', () => {
  it('places a schema in a database without changing the schema declaration', () => {
    const declaration = databaseSchemaComponent({ schemaName: 'crm' });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: { crm: declaration },
    });

    assert.strictEqual(declaration.databaseName, undefined);
    assert.strictEqual(database.schemas.crm.databaseName, 'app');
    assert.strictEqual(database.schemas.crm.schemaName, 'crm');
  });

  it('uses the database record key as the name of an unnamed schema', () => {
    const users = tableComponent({ tableName: 'users' });
    const reusable = databaseSchemaComponent({ tables: { users } });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: { public: reusable },
    });

    assert.strictEqual(reusable.schemaName, undefined);
    assert.strictEqual(users.databaseSchemaName, undefined);
    assert.strictEqual(database.schemas.public.schemaName, 'public');
    assert.strictEqual(
      database.schemas.public.tables.users.databaseSchemaName,
      'public',
    );
  });

  it('places a declared index in its containing schema and table', () => {
    const index = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: false,
    });
    const users = tableComponent({
      tableName: 'users',
      indexes: { email: index },
    });
    const schema = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users },
    });
    const contextualIndex = schema.tables.users.indexes.email;

    assert.strictEqual(index.databaseSchemaName, undefined);
    assert.strictEqual(index.tableName, undefined);
    assert.strictEqual(contextualIndex.databaseSchemaName, 'crm');
    assert.strictEqual(contextualIndex.tableName, 'users');
  });

  it('rejects placing an index under a table other than its constraint', () => {
    assert.throws(
      () =>
        tableComponent({
          tableName: 'users',
          indexes: {
            email: indexComponent({
              indexName: 'accounts_email_idx',
              tableName: 'accounts',
              columnNames: ['email'],
              isUnique: false,
            }),
          },
        }),
      /constrained to table "accounts".*placed in "users"/,
    );
  });

  it('rejects placing an index under a schema other than its constraint', () => {
    assert.throws(
      () =>
        tableComponent({
          tableName: 'users',
          databaseSchemaName: 'public',
          indexes: {
            email: indexComponent({
              indexName: 'users_email_idx',
              databaseSchemaName: 'audit',
              columnNames: ['email'],
              isUnique: false,
            }),
          },
        }),
      /constrained to database schema "audit".*placed in "public\.users"/,
    );
  });

  it('rejects placing a table under a schema other than its constraint', () => {
    const users = tableComponent({
      tableName: 'users',
      databaseSchemaName: 'audit',
    });

    assert.throws(
      () =>
        databaseSchemaComponent({
          schemaName: 'public',
          tables: { users },
        }),
      /constrained to database schema "audit".*placed in "public"/,
    );
  });

  it('rejects placing a schema under a database other than its constraint', () => {
    const audit = databaseSchemaComponent({
      schemaName: 'audit',
      databaseName: 'other',
    });

    assert.throws(
      () =>
        databaseComponent({
          databaseName: 'app',
          schemas: { audit },
        }),
      /constrained to database "other".*placed in "app"/,
    );
  });

  it('rejects an explicitly named schema stored under a different record key', () => {
    const audit = databaseSchemaComponent({ schemaName: 'audit' });

    assert.throws(
      () =>
        databaseComponent({
          databaseName: 'app',
          schemas: { public: audit },
        }),
      /record key "public" conflicts with its explicit name "audit"/,
    );
  });

  it('reuses one table declaration in two independent schemas', () => {
    const users = tableComponent({ tableName: 'users' });
    const publicSchema = databaseSchemaComponent({
      schemaName: 'public',
      tables: { users },
    });
    const auditSchema = databaseSchemaComponent({
      schemaName: 'audit',
      tables: { users },
    });

    assert.strictEqual(users.databaseSchemaName, undefined);
    assert.strictEqual(publicSchema.tables.users.databaseSchemaName, 'public');
    assert.strictEqual(auditSchema.tables.users.databaseSchemaName, 'audit');
    assert.notStrictEqual(publicSchema.tables.users, auditSchema.tables.users);
  });

  it('rejects using one alias for both a schema and a database extension', () => {
    const auditSchema = databaseSchemaComponent({ schemaName: 'audit' });
    const auditExtension = extensionWith('audit-extension');

    assert.throws(
      () =>
        databaseComponent({
          databaseName: 'app',
          schemas: { audit: auditSchema },
          extensions: { audit: auditExtension },
        }),
      /Duplicate component alias "audit"/,
    );
  });

  it('rejects using one alias for both a table column and index', () => {
    const id = columnSchemaComponent({ columnName: 'id', type: 'varchar' });
    const index = indexComponent({
      indexName: 'users_id_idx',
      columnNames: ['id'],
      isUnique: false,
    });

    assert.throws(
      () =>
        tableComponent({
          tableName: 'users',
          columns: { id },
          indexes: { id: index },
        }),
      /Duplicate component alias "id"/,
    );
  });

  it('derives a readable default index name from its logical target', () => {
    assert.strictEqual(
      generatedIndexName({
        tableName: 'users',
        indexTargetNames: ['email'],
        indexKind: 'json_path',
      }),
      'users_email_json_path_idx',
    );
    assert.strictEqual(
      generatedIndexName({
        tableName: 'users',
        indexTargetNames: ['data'],
        indexKind: 'json_document',
      }),
      'users_data_json_document_idx',
    );
  });
});

describe('validating a composed database', () => {
  it('discovers an extension table without exposing it as a database schema', () => {
    const auditLog = tableComponent({ tableName: 'audit_log' });
    const audit = extensionComponent('audit', { auditLog });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { audit },
    });

    assert.strictEqual(findComponent(database, isTableComponent), auditLog);
    assert.deepStrictEqual(findExtensions(database), [audit]);
    assert.deepStrictEqual(Object.keys(database.schemas), []);
  });

  it('accepts distinct physical table names across logical schemas', () => {
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableComponent({ tableName: 'users' }),
          },
        }),
        audit: databaseSchemaComponent({
          schemaName: 'audit',
          tables: {
            auditEvents: tableComponent({ tableName: 'audit_events' }),
          },
        }),
      },
    });

    assert.doesNotThrow(() => assertLogicalSchemaMapping(database));
  });

  it('rejects one physical table name reused across logical schemas', () => {
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableComponent({ tableName: 'users' }),
          },
        }),
        audit: databaseSchemaComponent({
          schemaName: 'audit',
          tables: {
            users: tableComponent({ tableName: 'users' }),
          },
        }),
      },
    });

    assert.throws(
      () => assertLogicalSchemaMapping(database),
      /Logical schema collision detected: users/,
    );
  });

  it('accepts a shared table discovered twice within one logical schema', () => {
    const users = tableComponent({ tableName: 'users' });
    const shared = extensionComponent('shared', { users });
    const schema = databaseSchemaComponent({
      schemaName: 'public',
      tables: { users },
      extensions: { shared },
    });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: { public: schema },
    });

    assert.doesNotThrow(() => assertLogicalSchemaMapping(database));
  });

  it('detects physical table collisions inside database extensions', () => {
    const extensionSchema = databaseSchemaComponent({
      schemaName: 'audit',
      tables: {
        users: tableComponent({ tableName: 'users' }),
      },
    });
    const audit = extensionComponent('audit', { extensionSchema });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableComponent({ tableName: 'users' }),
          },
        }),
      },
      extensions: { audit },
    });

    assert.throws(
      () => assertLogicalSchemaMapping(database),
      /Logical schema collision detected: users/,
    );
  });

  it('reports schema validation failure before executing migrations', async () => {
    const component = schemaComponent({
      migrations: [sqlMigration('root:001', [SQL`SELECT 1`])],
    });
    const migrator = SchemaComponentMigrator(component, {
      driverType: 'Test:test',
    } as never);

    await assert.rejects(
      () =>
        migrator.run({
          schema: {
            validateComponent: () => {
              throw new Error('schema validation failed');
            },
          },
        }),
      /schema validation failed/,
    );
  });
});
