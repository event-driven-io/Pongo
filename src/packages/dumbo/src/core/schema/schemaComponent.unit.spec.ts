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
  migrations: ReturnType<typeof sqlMigration>[] = [],
): ExtensionComponent =>
  extensionComponent(extensionName, {
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

  it('collapses repeated migrations with the same name and SQL regardless of hash mismatch handling', () => {
    const first = sqlMigration('same:001', [SQL`SELECT 1`]);

    assert.deepStrictEqual(
      dedupeMigrations([
        first,
        sqlMigration('same:001', [SQL`SELECT 1`], {
          ignoreHashMismatch: true,
        }),
      ]),
      [first],
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
      'schema:crm:create',
      'table:crm:users:create',
      'table:crm:roles:create',
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
      'schema:crm:create',
      'table:crm:users:create',
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

  it('runs generated and custom schema migrations before child migrations', () => {
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
      'schema:crm:create',
      own.name,
      'table:crm:users:create',
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
      'table:users:create',
      columnMigration.name,
    ]);
    assert.deepStrictEqual(migrationNames(crm.migrations()), [
      'schema:crm:create',
      'table:crm:users:create',
      columnMigration.name,
    ]);
  });

  it('exposes a component with nothing hidden behind it', () => {
    const migration = sqlMigration('root:001', [SQL`SELECT 1`]);
    const root = extensionWith('root', [migration]);

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
    const component = extensionWith('root', [
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
      'table:users:create',
      'table:roles:create',
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
      'table:users:create',
    ]);
  });
});

describe('grouping components in extensions', () => {
  it('exposes tables and schemas as frozen records', () => {
    const eventStoreSchema = databaseSchemaComponent({
      schemaName: 'event_store',
      tables: {
        events: tableComponent({ tableName: 'events' }),
      },
    });
    const auditLog = tableComponent({ tableName: 'audit_log' });
    const eventStore = extensionComponent('event-store', {
      schemas: { event_store: eventStoreSchema },
    });
    const audit = extensionComponent('audit', {
      tables: { auditLog },
    });

    assert.strictEqual(eventStore.schemas.event_store, eventStoreSchema);
    assert.deepStrictEqual(Object.keys(eventStore.tables), []);
    assert.strictEqual(audit.tables.auditLog, auditLog);
    assert.deepStrictEqual(Object.keys(audit.schemas), []);
    assert.strictEqual(Object.isFrozen(eventStore.schemas), true);
    assert.strictEqual(Object.isFrozen(eventStore.tables), true);
    assert.strictEqual(Object.isFrozen(audit.schemas), true);
    assert.strictEqual(Object.isFrozen(audit.tables), true);
    assert.strictEqual('extensions' in eventStore, false);
  });

  it('attaches an extension to a schema without exposing its internals as tables', () => {
    const migration = sqlMigration('audit_log:001', [SQL`SELECT 1`]);
    const internalTable = tableComponent({
      tableName: 'audit_log',
      migrations: () => [migration],
    });
    const audit = extensionComponent('audit', {
      tables: { internalTable },
    });
    const schema = databaseSchemaComponent({
      schemaName: 'public',
      extensions: { audit },
    });

    assert.deepStrictEqual(Object.keys(schema.tables), []);
    assert.deepStrictEqual(migrationNames(schema.migrations()), [
      'schema:public:create',
      migration.name,
    ]);
    assert.strictEqual(schema.extensions.audit.extensionName, 'audit');
    assert.strictEqual(
      schema.extensions.audit.tables.internalTable,
      internalTable,
    );
  });

  it('places an extension table in the schema it is attached to', () => {
    const messages = tableComponent({
      tableName: 'messages',
      columns: {
        id: columnSchemaComponent({ columnName: 'id', type: 'TEXT' }),
      },
    });
    const outbox = extensionComponent('outbox', { tables: { messages } });
    const declared = databaseSchemaComponent({
      schemaName: 'emt',
      tables: { messages },
    });
    const extended = databaseSchemaComponent({
      schemaName: 'emt',
      extensions: { outbox },
    });

    assert.deepStrictEqual(migrationNames(extended.migrations()), [
      'schema:emt:create',
      'table:emt:messages:create',
    ]);
    assert.deepStrictEqual(
      migrationNames(extended.migrations()),
      migrationNames(declared.migrations()),
    );
  });

  it('applies an extension placed under two aliases only once', () => {
    const migration = sqlMigration('users:001', [SQL`SELECT 1`]);
    const shared = extensionComponent('shared', {
      migrations: () => [migration],
    });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { shared, sharedAgain: shared },
    });

    assert.deepStrictEqual(database.migrations(), [migration]);
  });

  it('composes two extensions listed side by side in declaration order', () => {
    const first = sqlMigration('first:001', [SQL`SELECT 1`]);
    const second = sqlMigration('second:001', [SQL`SELECT 2`]);
    const schema = databaseSchemaComponent({
      schemaName: 'crm',
      extensions: {
        outbox: extensionWith('outbox', [first]),
        audit: extensionWith('audit', [second]),
      },
    });

    assert.deepStrictEqual(migrationNames(schema.migrations()), [
      'schema:crm:create',
      first.name,
      second.name,
    ]);
  });

  it('attaches a neutral extension to both a schema and a database', () => {
    const migration = sqlMigration('telemetry:001', [SQL`SELECT 1`]);
    const telemetry = extensionWith('telemetry', [migration]);
    const schema = databaseSchemaComponent({
      schemaName: 'crm',
      extensions: { telemetry },
    });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { telemetry },
    });

    assert.deepStrictEqual(migrationNames(schema.migrations()), [
      'schema:crm:create',
      migration.name,
    ]);
    assert.deepStrictEqual(database.migrations(), [migration]);
  });

  it('distinguishes an extension from a table without inspecting names', () => {
    const extension = extensionWith('audit');
    const table = tableComponent({ tableName: 'audit_log' });

    assert.strictEqual(extension[schemaComponentType], extensionComponentType);
    assert.strictEqual(table[schemaComponentType], tableComponentType);
    assert.notStrictEqual(table[schemaComponentType], extensionComponentType);
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
    const audit = extensionWith('audit', [schemaExtensionMigration]);
    const eventStore = extensionWith('event-store', [
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
      'schema:crm:create',
      tableMigration.name,
      schemaExtensionMigration.name,
      databaseExtensionMigration.name,
    ]);
  });

  it('runs extension migrations before contributed schema migrations', () => {
    const own = sqlMigration('event-store:001', [SQL`SELECT 1`]);
    const schemaMigration = sqlMigration('messages:002', [SQL`SELECT 2`]);
    const eventStore = extensionComponent('event-store', {
      schemas: {
        event_store: databaseSchemaComponent({
          schemaName: 'event_store',
          migrations: () => [schemaMigration],
        }),
      },
      migrations: () => [own],
    });

    assert.deepStrictEqual(migrationNames(eventStore.migrations()), [
      own.name,
      'schema:event_store:create',
      schemaMigration.name,
    ]);
  });

  it('runs extension migrations before contributed table migrations', () => {
    const own = sqlMigration('outbox:001', [SQL`SELECT 1`]);
    const tableMigration = sqlMigration('messages:002', [SQL`SELECT 2`]);
    const outbox = extensionComponent('outbox', {
      tables: {
        messages: tableComponent({
          tableName: 'messages',
          migrations: () => [tableMigration],
        }),
      },
      migrations: () => [own],
    });

    assert.deepStrictEqual(migrationNames(outbox.migrations()), [
      own.name,
      tableMigration.name,
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
      'table:event_store:messages:create',
      'schema:readmodels:create',
      'table:readmodels:users:create',
    ]);
  });

  it('rejects a schema extension attached to a database schema', () => {
    const audit = extensionComponent('audit', {
      schemas: {
        audit: databaseSchemaComponent({ schemaName: 'audit' }),
      },
    });
    const publicAudit = extensionComponent('public-audit', {
      schemas: {
        public: databaseSchemaComponent({ schemaName: 'public' }),
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
    assert.throws(
      () =>
        databaseSchemaComponent({
          schemaName: 'public',
          extensions: { publicAudit },
        }),
      /Extension "public-audit".*schema "public".*schema "public"/,
    );
  });

  it('rejects an extension schema stored under a different record key', () => {
    assert.throws(
      () =>
        extensionComponent('audit', {
          schemas: {
            public: databaseSchemaComponent({ schemaName: 'audit' }),
          },
        }),
      /record key "public" conflicts with its explicit name "audit"/,
    );
  });

  it('places a table extension attached to a database in its default schema', () => {
    const audit = extensionComponent('audit', {
      tables: {
        auditLog: tableComponent({
          tableName: 'audit_log',
          columns: {
            message: columnSchemaComponent({
              columnName: 'message',
              type: 'TEXT',
            }),
          },
        }),
      },
    });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { audit },
    });

    assert.strictEqual(database.defaultSchema.extensions.audit, audit);
    assert.deepStrictEqual(migrationNames(database.migrations()), [
      'table:audit_log:create',
    ]);
  });

  it('keeps a schema contributed by an extension out of the database schema map', () => {
    const readmodels = databaseSchemaComponent({ schemaName: 'readmodels' });
    const eventStore = extensionComponent('event-store', {
      schemas: { readmodels },
    });
    const database = databaseComponent({
      schemas: {
        crm: databaseSchemaComponent({ schemaName: 'crm' }),
      },
      extensions: { eventStore },
    });

    assert.deepStrictEqual(Object.keys(database.schemas), ['crm']);
    assert.strictEqual(
      database.extensions.eventStore.schemas.readmodels,
      readmodels,
    );
    assert.deepStrictEqual(migrationNames(database.migrations()), [
      'schema:crm:create',
      'schema:readmodels:create',
    ]);
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
      ['schema:crm:create', 'index:crm:users:users_email_idx:create'],
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
      ['schema:public:create', 'table:public:users:create'],
    );
    assert.deepStrictEqual(
      auditSchema.migrations().map(({ name }) => name),
      ['schema:audit:create', 'table:audit:users:create'],
    );
  });
});

describe('validating a composed database', () => {
  it('reaches a database schema contributed by an extension through it', () => {
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
      'schema:audit:create',
      migration.name,
    ]);
    assert.strictEqual(database.extensions.audit.extensionName, 'audit');
    assert.strictEqual(database.extensions.audit.schemas.audit, auditSchema);
    assert.deepStrictEqual(Object.keys(database.schemas), []);
  });
});
