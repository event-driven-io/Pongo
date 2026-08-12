import assert from 'node:assert';
import { describe, expectTypeOf, it } from 'vitest';
import { SQL, SQLDefaultSchemaNameToken } from '../sql';
import {
  columnSchemaComponent,
  databaseComponent,
  databaseComponentType,
  databaseSchemaComponent,
  databaseSchemaComponentType,
  extensionComponent,
  extensionComponentType,
  generatedIndexName,
  indexComponent,
  indexComponentType,
  schemaComponent,
  schemaComponentType,
  sqlMigration,
  tableComponent,
  tableComponentType,
  type DatabaseComponent,
  type DatabaseSchemaComponent,
  type ExtensionComponent,
  type IndexComponent,
  type TableComponent,
} from './index';
import { dedupeMigrations } from './schemaComponent';

const migrationNames = (
  migrations: ReadonlyArray<{ name: string }>,
): string[] => migrations.map(({ name }) => name);

const extensionWith = (
  extensionName: string,
  extensions: Readonly<Record<string, ExtensionComponent>> = {},
  migrations: ReturnType<typeof sqlMigration>[] = [],
): ExtensionComponent =>
  extensionComponent(extensionName, {
    extensions,
    migrations: () => migrations,
  });

const migrationBundleType: unique symbol = Symbol(
  'test.schemaComponent.migrationBundle',
);

describe('collapsing repeated migrations', () => {
  it('collapses one migration listed twice into a single run', () => {
    const migration = sqlMigration('shared:001', [SQL`SELECT 1`]);

    assert.deepStrictEqual(dedupeMigrations([migration, migration]), [
      migration,
    ]);
  });

  it('collapses two migrations declared apart with the same name and SQL', () => {
    assert.deepStrictEqual(
      dedupeMigrations([
        sqlMigration('same:001', [SQL`SELECT 1`]),
        sqlMigration('same:001', [SQL`SELECT 1`]),
      ]),
      [sqlMigration('same:001', [SQL`SELECT 1`])],
    );
  });

  it('rejects two different migrations that would share one ledger identity', () => {
    assert.throws(
      () =>
        dedupeMigrations([
          sqlMigration('duplicate:001', [SQL`SELECT 1`]),
          sqlMigration('duplicate:001', [SQL`SELECT 2`]),
        ]),
      /Duplicate migration name "duplicate:001"/,
    );
  });

  it('applies a repeated migration in the order it was first declared', () => {
    assert.deepStrictEqual(
      migrationNames(
        dedupeMigrations([
          sqlMigration('same:001', [SQL`SELECT 1`]),
          sqlMigration('first:002', [SQL`SELECT 2`]),
          sqlMigration('second:003', [SQL`SELECT 3`]),
          sqlMigration('same:001', [SQL`SELECT 1`]),
        ]),
      ),
      ['same:001', 'first:002', 'second:003'],
    );
  });
});

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
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: {
        users: tableComponent({
          tableName: 'users',
          columns: {
            email: columnSchemaComponent({ columnName: 'email', type: 'TEXT' }),
          },
        }),
        roles: tableComponent({
          tableName: 'roles',
          columns: {
            name: columnSchemaComponent({ columnName: 'name', type: 'TEXT' }),
          },
        }),
      },
    });

    assert.deepStrictEqual(migrationNames(crm.migrations()), [
      'schema:relational:crm:001:create',
      'table:relational:crm:users:001:create',
      'table:relational:crm:roles:001:create',
    ]);
  });

  it('accesses declared children through typed record aliases', () => {
    const users = tableComponent({ tableName: 'users' });
    const schema = databaseSchemaComponent({
      schemaName: 'public',
      tables: { users },
    });

    expectTypeOf(schema.tables.users).toEqualTypeOf(users);
    assert.strictEqual(schema.tables.users.tableName, 'users');
    assert.deepStrictEqual(Object.keys(schema.tables), ['users']);
    assert.strictEqual(Object.getPrototypeOf(schema.tables), null);
  });

  it('accepts domain aliases that overlap collection and object API names', () => {
    const entries = tableComponent({ tableName: 'entries' });
    const get = tableComponent({ tableName: 'get' });
    const size = tableComponent({ tableName: 'size' });
    const constructor = tableComponent({ tableName: 'constructor' });
    const schema = databaseSchemaComponent({
      schemaName: 'public',
      tables: { entries, get, size, constructor },
    });

    assert.strictEqual(schema.tables.entries, entries);
    assert.strictEqual(schema.tables.get, get);
    assert.strictEqual(schema.tables.size, size);
    assert.strictEqual(schema.tables.constructor, constructor);
  });

  it('keeps a composed declaration read-only after construction', () => {
    const users = tableComponent({
      tableName: 'users',
      columns: {
        email: columnSchemaComponent({ columnName: 'email', type: 'TEXT' }),
      },
    });
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users },
    });

    assert.strictEqual('addComponent' in crm, false);
    assert.strictEqual('addMigration' in crm, false);
    assert.deepStrictEqual(migrationNames(crm.migrations()), [
      'schema:relational:crm:001:create',
      'table:relational:crm:users:001:create',
    ]);
    assert.deepStrictEqual(crm.migrations(), crm.migrations());
  });

  it('keeps each ownership record immutable after composition', () => {
    const email = columnSchemaComponent({
      columnName: 'email',
      type: 'varchar',
    });
    const emailIndex = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: true,
    });
    const users = tableComponent({
      tableName: 'users',
      columns: { email },
      indexes: { emailLookup: emailIndex },
    });
    const publicSchema = databaseSchemaComponent({
      schemaName: 'public',
      tables: { users },
      extensions: {},
    });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: { public: publicSchema },
      extensions: {},
    });

    assert.strictEqual(Object.isFrozen(database.schemas), true);
    assert.strictEqual(Object.isFrozen(database.extensions), true);
    assert.strictEqual(Object.isFrozen(publicSchema.tables), true);
    assert.strictEqual(Object.isFrozen(publicSchema.extensions), true);
    assert.strictEqual(Object.isFrozen(users.columns), true);
    assert.strictEqual(Object.isFrozen(users.indexes), true);
  });
});

describe('exposing a component as a plain frozen value', () => {
  it('returns exactly what its declaration returned when it has no children', () => {
    const first = sqlMigration('email:001', [SQL`SELECT 1`]);
    const second = sqlMigration('email:002', [SQL`SELECT 2`]);
    const email = columnSchemaComponent({
      columnName: 'email',
      type: 'TEXT',
      migrations: () => [first, second],
    });

    assert.deepStrictEqual(email.migrations(), [first, second]);
  });

  it('returns its own migrations before its children in insertion order', () => {
    const own = sqlMigration('crm:001', [SQL`SELECT 0`]);
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: {
        users: tableComponent({
          tableName: 'users',
          columns: {
            email: columnSchemaComponent({ columnName: 'email', type: 'TEXT' }),
          },
        }),
      },
      migrations: () => [own],
    });

    assert.deepStrictEqual(migrationNames(crm.migrations()), [
      'schema:relational:crm:001:create',
      own.name,
      'table:relational:crm:users:001:create',
    ]);
  });

  it('composes migrations transitively through a three-level tree', () => {
    const columnMigration = sqlMigration('email:backfill', [SQL`SELECT 1`]);
    const email = columnSchemaComponent({
      columnName: 'email',
      type: 'TEXT',
      migrations: () => [columnMigration],
    });
    const users = tableComponent({
      tableName: 'users',
      columns: { email },
    });
    const crm = databaseSchemaComponent({
      schemaName: 'crm',
      tables: { users },
    });

    assert.deepStrictEqual(migrationNames(users.migrations()), [
      'table:relational:users:001:create',
      columnMigration.name,
    ]);
    assert.deepStrictEqual(migrationNames(crm.migrations()), [
      'schema:relational:crm:001:create',
      'table:relational:crm:users:001:create',
      columnMigration.name,
    ]);
  });

  it('exposes a component with nothing hidden behind it', () => {
    const migration = sqlMigration('root:001', [SQL`SELECT 1`]);
    const child = extensionWith('child');
    const root = extensionWith('root', { child }, [migration]);

    assert.deepStrictEqual(Object.getOwnPropertyNames(root), Object.keys(root));
    assert.deepStrictEqual(Object.getOwnPropertySymbols(root), [
      schemaComponentType,
    ]);

    const copy = { ...root };
    assert.strictEqual(copy[schemaComponentType], extensionComponentType);
    assert.deepStrictEqual(copy.migrations(), root.migrations());
    assert.deepStrictEqual(copy.migrations(), [migration]);
  });

  it('exposes migrations as a method and never as an accessor', () => {
    const component = extensionWith('root', { users: extensionWith('users') }, [
      sqlMigration('root:001', [SQL`SELECT 1`]),
    ]);

    assert.strictEqual(typeof component.migrations, 'function');

    for (const key of [
      ...Object.getOwnPropertyNames(component),
      ...Object.getOwnPropertySymbols(component),
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(component, key)!;
      assert.strictEqual(
        typeof descriptor.get,
        'undefined',
        `${String(key)} is a getter`,
      );
      assert.strictEqual(
        typeof descriptor.set,
        'undefined',
        `${String(key)} is a setter`,
      );
    }
  });
});

describe('grouping components that migrate as one unit', () => {
  it('marks a group with the kind it was declared with', () => {
    const group = schemaComponent(migrationBundleType);

    assert.strictEqual(group[schemaComponentType], migrationBundleType);
    assert.deepStrictEqual(Object.getOwnPropertyNames(group), ['migrations']);
    assert.deepStrictEqual(group.migrations(), []);
  });

  it('migrates the components it groups in declaration order', () => {
    const users = tableComponent({
      tableName: 'users',
      columns: {
        email: columnSchemaComponent({ columnName: 'email', type: 'TEXT' }),
      },
    });
    const roles = tableComponent({
      tableName: 'roles',
      columns: {
        name: columnSchemaComponent({ columnName: 'name', type: 'TEXT' }),
      },
    });
    const group = schemaComponent(migrationBundleType, {
      components: [users, roles],
    });

    assert.deepStrictEqual(migrationNames(group.migrations()), [
      'table:relational:users:001:create',
      'table:relational:roles:001:create',
    ]);
  });

  it('runs its own migration before the components it groups', () => {
    const own = sqlMigration('group:001', [SQL`SELECT 1`]);
    const users = tableComponent({
      tableName: 'users',
      columns: {
        email: columnSchemaComponent({ columnName: 'email', type: 'TEXT' }),
      },
    });
    const group = schemaComponent(migrationBundleType, {
      migrations: () => [own],
      components: [users],
    });

    assert.deepStrictEqual(migrationNames(group.migrations()), [
      own.name,
      'table:relational:users:001:create',
    ]);
  });
});

describe('grouping components in extensions', () => {
  it('exposes schemas and nested extensions as frozen records', () => {
    const eventStoreSchema = databaseSchemaComponent({
      schemaName: 'event_store',
      tables: {
        events: tableComponent({ tableName: 'events' }),
      },
    });
    const checkpointsSchema = databaseSchemaComponent({
      schemaName: 'checkpoints',
      tables: {
        checkpoints: tableComponent({
          tableName: 'processor_checkpoints',
        }),
      },
    });
    const checkpoints = extensionComponent('checkpoints', {
      schemas: { checkpoints: checkpointsSchema },
    });
    const eventStore = extensionComponent('event-store', {
      schemas: { event_store: eventStoreSchema },
      extensions: { checkpoints },
    });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { eventStore },
    });

    assert.deepStrictEqual(migrationNames(eventStore.migrations()), [
      'schema:relational:event_store:001:create',
      'schema:relational:checkpoints:001:create',
    ]);
    assert.deepStrictEqual(
      migrationNames(database.migrations()),
      migrationNames(eventStore.migrations()),
    );
    assert.strictEqual(eventStore.schemas.event_store, eventStoreSchema);
    assert.strictEqual(eventStore.schemas.checkpoints, checkpointsSchema);
    assert.strictEqual(eventStore.extensions.checkpoints, checkpoints);
    assert.strictEqual(Object.isFrozen(eventStore.schemas), true);
    assert.strictEqual(Object.isFrozen(eventStore.extensions), true);
    assert.strictEqual(
      database.extensions.eventStore.extensionName,
      'event-store',
    );
    assert.strictEqual(database.schemas.event_store, eventStoreSchema);
    assert.strictEqual(database.schemas.checkpoints, checkpointsSchema);
  });

  it('attaches an extension to a schema without exposing its internals as tables', () => {
    const migration = sqlMigration('audit_log:001', [SQL`SELECT 1`]);
    const internalTable = tableComponent({
      tableName: 'audit_log',
      migrations: () => [migration],
    });
    const auditSchema = databaseSchemaComponent({
      schemaName: 'public',
      tables: { internalTable },
    });
    const audit = extensionComponent('audit', {
      schemas: { public: auditSchema },
    });
    const schema = databaseSchemaComponent({
      schemaName: 'public',
      extensions: { audit },
    });

    assert.deepStrictEqual(Object.keys(schema.tables), []);
    assert.deepStrictEqual(migrationNames(schema.migrations()), [
      'schema:relational:public:001:create',
      migration.name,
    ]);
    assert.strictEqual(schema.extensions.audit.extensionName, 'audit');
    assert.strictEqual(
      schema.extensions.audit.schemas.public.tables.internalTable,
      internalTable,
    );
  });

  it('applies a nested extension placed under two aliases only once', () => {
    const migration = sqlMigration('users:001', [SQL`SELECT 1`]);
    const shared = extensionComponent('shared', {
      migrations: () => [migration],
    });
    const extension = extensionComponent('root', {
      extensions: { shared, sharedAgain: shared },
    });

    assert.deepStrictEqual(extension.migrations(), [migration]);
  });

  it('distinguishes an extension from a table without inspecting names', () => {
    const extension = extensionWith('audit');
    const table = tableComponent({ tableName: 'audit_log' });

    assert.strictEqual(extension[schemaComponentType], extensionComponentType);
    assert.strictEqual(table[schemaComponentType], tableComponentType);
    assert.notStrictEqual(table[schemaComponentType], extensionComponentType);
  });

  it('finds tables and extensions nested inside another extension', () => {
    const migration = sqlMigration('audit_log:001', [SQL`SELECT 1`]);
    const auditLog = tableComponent({
      tableName: 'audit_log',
      migrations: () => [migration],
    });
    const nested = extensionComponent('nested-audit', {
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: { auditLog },
        }),
      },
    });
    const audit = extensionComponent('audit', {
      extensions: { nested },
    });
    const schema = databaseSchemaComponent({
      schemaName: 'public',
      extensions: { audit },
    });

    assert.deepStrictEqual(Object.keys(schema.tables), []);
    assert.strictEqual(schema.extensions.audit.extensionName, 'audit');
    assert.strictEqual(
      schema.extensions.audit.schemas.public.tables.auditLog,
      auditLog,
    );
    assert.deepStrictEqual(migrationNames(schema.migrations()), [
      'schema:relational:public:001:create',
      migration.name,
    ]);
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

    assert.strictEqual(
      database.extensions.eventStore.extensionName,
      'event-store',
    );
    assert.strictEqual(
      database.schemas.crm.extensions.audit.extensionName,
      'audit',
    );
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
              migrations: () => [tableMigration],
            }),
          },
          extensions: { audit },
        }),
      },
      extensions: { eventStore },
    });

    assert.deepStrictEqual(migrationNames(database.migrations()), [
      'schema:relational:crm:001:create',
      tableMigration.name,
      schemaExtensionMigration.name,
      databaseExtensionMigration.name,
    ]);
  });

  it('runs extension migrations before its schemas and nested extensions', () => {
    const own = sqlMigration('event-store:001', [SQL`SELECT 1`]);
    const schemaMigration = sqlMigration('messages:002', [SQL`SELECT 2`]);
    const nestedMigration = sqlMigration('outbox:003', [SQL`SELECT 3`]);
    const outbox = extensionComponent('outbox', {
      migrations: () => [nestedMigration],
    });
    const eventStore = extensionComponent('event-store', {
      schemas: {
        event_store: databaseSchemaComponent({
          schemaName: 'event_store',
          migrations: () => [schemaMigration],
        }),
      },
      extensions: { outbox },
      migrations: () => [own],
    });

    assert.deepStrictEqual(migrationNames(eventStore.migrations()), [
      own.name,
      'schema:relational:event_store:001:create',
      schemaMigration.name,
      nestedMigration.name,
    ]);
  });

  it('keeps extension schema paths when attached to a database', () => {
    const eventStore = extensionComponent('event-store', {
      schemas: {
        default: databaseSchemaComponent({
          schemaName: SQLDefaultSchemaNameToken.from(),
          tables: {
            messages: tableComponent({
              tableName: 'messages',
              kind: 'event_store',
              columns: {
                id: columnSchemaComponent({
                  columnName: 'id',
                  type: 'TEXT',
                }),
              },
            }),
          },
        }),
        readmodels: databaseSchemaComponent({
          schemaName: 'readmodels',
          tables: {
            users: tableComponent({
              tableName: 'users',
              columns: {
                id: columnSchemaComponent({
                  columnName: 'id',
                  type: 'TEXT',
                }),
              },
            }),
          },
        }),
      },
    });
    const database = databaseComponent({ extensions: { eventStore } });

    assert.deepStrictEqual(migrationNames(database.migrations()), [
      'schema:relational:001:create',
      'table:event_store:messages:001:create',
      'schema:relational:readmodels:001:create',
      'table:relational:readmodels:users:001:create',
    ]);
  });

  it('rejects a schema extension that contributes another physical schema', () => {
    const audit = extensionComponent('audit', {
      schemas: {
        audit: databaseSchemaComponent({ schemaName: 'audit' }),
      },
    });

    assert.throws(
      () =>
        databaseSchemaComponent({
          schemaName: 'public',
          extensions: { audit },
        }),
      /Extension "audit".*schema "audit".*schema "public"/,
    );
  });

  it('rejects a schema key shared by a direct schema and an extension', () => {
    const eventStore = extensionComponent('event-store', {
      schemas: {
        readmodels: databaseSchemaComponent({ schemaName: 'readmodels' }),
      },
    });

    assert.throws(
      () =>
        databaseComponent({
          schemas: {
            readmodels: databaseSchemaComponent({ schemaName: 'readmodels' }),
          },
          extensions: { eventStore },
        }),
      /schema key "readmodels".*extension "event-store"/,
    );
  });

  it('rejects a schema key shared by two extensions', () => {
    const first = extensionComponent('first', {
      schemas: {
        readmodels: databaseSchemaComponent({ schemaName: 'readmodels' }),
      },
    });
    const second = extensionComponent('second', {
      schemas: {
        readmodels: databaseSchemaComponent({ schemaName: 'readmodels' }),
      },
    });

    assert.throws(
      () => databaseComponent({ extensions: { first, second } }),
      /schema key "readmodels".*extensions "first" and "second"/,
    );
  });

  it('behaves the same when migrated directly or from a database root', () => {
    const migration = sqlMigration('audit:001', [SQL`SELECT 1`]);
    const audit = extensionComponent('audit', {
      migrations: () => [migration],
    });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { audit },
    });

    assert.deepStrictEqual(audit.migrations(), [migration]);
    assert.deepStrictEqual(database.migrations(), audit.migrations());
  });
});

describe('placing reusable declarations in the database hierarchy', () => {
  it('places a schema in a database without changing the schema declaration', () => {
    const crm = databaseSchemaComponent({ schemaName: 'crm' });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: { crm },
    });

    assert.strictEqual(database.schemas.crm, crm);
    assert.deepStrictEqual(database.migrations(), crm.migrations());
    assert.strictEqual(database.schemas.crm.schemaName, 'crm');
  });

  it('keeps a default schema under its typed database record key', () => {
    const users = tableComponent({ tableName: 'users' });
    const reusable = databaseSchemaComponent({
      schemaName: SQLDefaultSchemaNameToken.from(),
      tables: { users },
    });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: { public: reusable },
    });

    assert.ok(SQLDefaultSchemaNameToken.check(reusable.schemaName));
    assert.strictEqual(database.schemas.public, reusable);
    assert.deepStrictEqual(database.migrations(), reusable.migrations());
    assert.ok(
      SQLDefaultSchemaNameToken.check(database.schemas.public.schemaName),
    );
    assert.strictEqual(database.schemas.public.tables.users.tableName, 'users');
  });

  it('keeps a declared index in its containing table without rebinding it', () => {
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

    assert.strictEqual(contextualIndex, index);
    assert.strictEqual(contextualIndex.indexName, index.indexName);
    assert.deepStrictEqual(
      schema.migrations().map(({ name }) => name),
      [
        'schema:relational:crm:001:create',
        'index:relational:crm:users:users_email_idx:001:create',
      ],
    );
  });

  it('types a column as not nullable exactly when it is declared so', () => {
    const id = columnSchemaComponent({
      columnName: 'id',
      type: 'TEXT',
      primaryKey: true,
    });
    const email = columnSchemaComponent({
      columnName: 'email',
      type: 'TEXT',
      notNull: true,
    });
    const name = columnSchemaComponent({ columnName: 'name', type: 'TEXT' });

    expectTypeOf(id.notNull).toEqualTypeOf<true>();
    expectTypeOf(email.notNull).toEqualTypeOf<true>();
    expectTypeOf(name.notNull).toEqualTypeOf<false | undefined>();
    expectTypeOf(id.columnName).toEqualTypeOf<'id'>();
    expectTypeOf(name.columnName).toEqualTypeOf<'name'>();

    assert.strictEqual(id.primaryKey, true);
    assert.strictEqual(email.notNull, true);
    assert.strictEqual(name.notNull, undefined);
  });

  it('gives a column no way to reach the table it belongs to', () => {
    const email = columnSchemaComponent({
      columnName: 'email',
      type: 'TEXT',
    });

    assert.strictEqual('table' in email, false);
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
    const users = tableComponent({
      tableName: 'users',
      columns: {
        email: columnSchemaComponent({ columnName: 'email', type: 'TEXT' }),
      },
    });
    const publicSchema = databaseSchemaComponent({
      schemaName: 'public',
      tables: { users },
    });
    const auditSchema = databaseSchemaComponent({
      schemaName: 'audit',
      tables: { users },
    });

    assert.strictEqual(publicSchema.tables.users.tableName, 'users');
    assert.strictEqual(auditSchema.tables.users.tableName, 'users');
    assert.deepStrictEqual(
      publicSchema.migrations().map(({ name }) => name),
      [
        'schema:relational:public:001:create',
        'table:relational:public:users:001:create',
      ],
    );
    assert.deepStrictEqual(
      auditSchema.migrations().map(({ name }) => name),
      [
        'schema:relational:audit:001:create',
        'table:relational:audit:users:001:create',
      ],
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
  it('exposes a database schema contributed by an extension', () => {
    const migration = sqlMigration('audit_log:001', [SQL`SELECT 1`]);
    const auditLog = tableComponent({
      tableName: 'audit_log',
      migrations: () => [migration],
    });
    const auditSchema = databaseSchemaComponent({
      schemaName: 'audit',
      tables: { auditLog },
    });
    const audit = extensionComponent('audit', {
      schemas: { audit: auditSchema },
    });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { audit },
    });

    assert.deepStrictEqual(migrationNames(database.migrations()), [
      'schema:relational:audit:001:create',
      migration.name,
    ]);
    assert.strictEqual(database.extensions.audit.extensionName, 'audit');
    assert.strictEqual(database.schemas.audit, auditSchema);
  });
});
