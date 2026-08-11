import assert from 'node:assert';
import { describe, expectTypeOf, it } from 'vitest';
import { SQL, SQLDefaultSchemaNameToken } from '../sql';
import {
  SchemaComponentMigrator,
  columnSchemaComponent,
  databaseComponent,
  databaseComponentType,
  databaseSchemaComponent,
  databaseSchemaComponentType,
  extensionComponent,
  extensionComponentType,
  generatedIndexName,
  genericComponentType,
  indexComponent,
  indexComponentType,
  isExtensionComponent,
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

const migrationNames = (
  migrations: ReadonlyArray<{ name: string }>,
): string[] => migrations.map(({ name }) => name);

const extensionWith = (
  extensionName: string,
  components: Readonly<Record<string, AnySchemaComponent>> = {},
  migrations: ReturnType<typeof sqlMigration>[] = [],
): ExtensionComponent =>
  extensionComponent(extensionName, components, {
    migrations: () => migrations,
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
    const rootMigration = sqlMigration('root:001', [SQL`SELECT 0`]);
    const firstMigration = sqlMigration('first:001', [SQL`SELECT 1`]);
    const secondMigration = sqlMigration('second:001', [SQL`SELECT 2`]);
    const root = schemaComponent({
      migrations: () => [rootMigration],
      components: [
        schemaComponent({ migrations: () => [firstMigration] }),
        schemaComponent({ migrations: () => [secondMigration] }),
      ],
    });

    assert.deepStrictEqual(root.migrations(), [
      rootMigration,
      firstMigration,
      secondMigration,
    ]);
  });

  it('runs a shared child migration once when the child is declared twice', () => {
    const migration = sqlMigration('child:001', [SQL`SELECT 1`]);
    const child = schemaComponent({ migrations: () => [migration] });
    const root = schemaComponent({ components: [child, child] });

    assert.deepStrictEqual(root.migrations(), [migration]);
    assert.deepStrictEqual(root.components, [child, child]);
  });

  it('rejects two different migrations that would share one ledger identity', () => {
    const root = schemaComponent({
      components: [
        schemaComponent({
          migrations: () => [sqlMigration('duplicate:001', [SQL`SELECT 1`])],
        }),
        schemaComponent({
          migrations: () => [sqlMigration('duplicate:001', [SQL`SELECT 2`])],
        }),
      ],
    });

    assert.throws(
      () => root.migrations(),
      /Duplicate migration name "duplicate:001"/,
    );
  });

  it('accepts one migration reused by multiple components', () => {
    const migration = sqlMigration('shared:001', [SQL`SELECT 1`]);
    const root = schemaComponent({
      components: [
        schemaComponent({ migrations: () => [migration] }),
        schemaComponent({ migrations: () => [migration] }),
      ],
    });

    assert.deepStrictEqual(root.migrations(), [migration]);
  });

  it('applies an identical migration declared in two components only once', () => {
    const root = schemaComponent({
      components: [
        schemaComponent({
          migrations: () => [sqlMigration('same:001', [SQL`SELECT 1`])],
        }),
        schemaComponent({
          migrations: () => [sqlMigration('same:001', [SQL`SELECT 1`])],
        }),
      ],
    });

    assert.deepStrictEqual(root.migrations(), [
      sqlMigration('same:001', [SQL`SELECT 1`]),
    ]);
  });

  it('applies a repeated migration in the order it was first declared', () => {
    const root = schemaComponent({
      components: [
        schemaComponent({
          migrations: () => [
            sqlMigration('same:001', [SQL`SELECT 1`]),
            sqlMigration('first:002', [SQL`SELECT 2`]),
          ],
        }),
        schemaComponent({
          migrations: () => [
            sqlMigration('second:003', [SQL`SELECT 3`]),
            sqlMigration('same:001', [SQL`SELECT 1`]),
          ],
        }),
      ],
    });

    assert.deepStrictEqual(
      root.migrations().map((migration) => migration.name),
      ['same:001', 'first:002', 'second:003'],
    );
  });

  it('applies a migration once when the component declaring it is reused in two places', () => {
    const child = schemaComponent({
      migrations: () => [sqlMigration('child:001', [SQL`SELECT 1`])],
    });
    const root = schemaComponent({
      components: [
        schemaComponent({ components: [child] }),
        schemaComponent({ components: [child] }),
      ],
    });

    assert.deepStrictEqual(
      root.migrations().map((migration) => migration.name),
      ['child:001'],
    );
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
    const child = schemaComponent();
    const root = schemaComponent({ components: [child] });

    assert.strictEqual('addComponent' in root, false);
    assert.strictEqual('addMigration' in root, false);
    assert.strictEqual(Object.isFrozen(root.components), true);
    assert.throws(() => {
      (root.components as AnySchemaComponent[]).push(schemaComponent());
    }, TypeError);
    assert.deepStrictEqual(root.components, [child]);
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

  it('composes a frozen child list without changing it', () => {
    const child = schemaComponent();
    const source = Object.freeze([child]);
    const root = schemaComponent({ components: source });

    assert.deepStrictEqual(source, [child]);
    assert.deepStrictEqual(root.components, [child]);
  });
});

describe('exposing a component as a plain frozen value', () => {
  it('returns exactly what its declaration returned when it has no children', () => {
    const first = sqlMigration('leaf:001', [SQL`SELECT 1`]);
    const second = sqlMigration('leaf:002', [SQL`SELECT 2`]);
    const leaf = schemaComponent({ migrations: () => [first, second] });

    assert.deepStrictEqual(leaf.migrations(), [first, second]);
  });

  it('returns its own migrations before its children in insertion order', () => {
    const own = sqlMigration('root:001', [SQL`SELECT 0`]);
    const firstChild = sqlMigration('first:001', [SQL`SELECT 1`]);
    const secondChild = sqlMigration('second:001', [SQL`SELECT 2`]);
    const root = schemaComponent({
      migrations: () => [own],
      components: [
        schemaComponent({ migrations: () => [firstChild] }),
        schemaComponent({ migrations: () => [secondChild] }),
      ],
    });

    assert.deepStrictEqual(root.migrations(), [own, firstChild, secondChild]);
  });

  it('composes migrations transitively through a three-level tree', () => {
    const leafMigration = sqlMigration('leaf:001', [SQL`SELECT 3`]);
    const middleMigration = sqlMigration('middle:001', [SQL`SELECT 2`]);
    const rootMigration = sqlMigration('root:001', [SQL`SELECT 1`]);
    const leaf = schemaComponent({ migrations: () => [leafMigration] });
    const middle = schemaComponent({
      migrations: () => [middleMigration],
      components: [leaf],
    });
    const root = schemaComponent({
      migrations: () => [rootMigration],
      components: [middle],
    });

    assert.deepStrictEqual(middle.migrations(), [
      middleMigration,
      leafMigration,
    ]);
    assert.deepStrictEqual(root.migrations(), [
      rootMigration,
      middleMigration,
      leafMigration,
    ]);
  });

  it('passes the component itself to its declaration', () => {
    const declared: AnySchemaComponent[] = [];
    const component = schemaComponent({
      migrations: (self) => {
        declared.push(self);
        return [];
      },
    });

    assert.deepStrictEqual(declared, []);

    component.migrations();

    assert.deepStrictEqual(declared, [component]);
  });

  it('declares against the component it is read from, not the one it was built from', () => {
    const original = schemaComponent({
      migrations: (self) => [
        sqlMigration(`declared:${self.components.length}`, [SQL`SELECT 1`]),
      ],
      components: [schemaComponent()],
    });
    const clone = Object.freeze({
      ...original,
      components: Object.freeze([schemaComponent(), schemaComponent()]),
    }) as AnySchemaComponent;

    assert.deepStrictEqual(
      original.migrations().map((migration) => migration.name),
      ['declared:1'],
    );
    assert.deepStrictEqual(
      clone.migrations().map((migration) => migration.name),
      ['declared:2'],
    );
  });

  it('exposes a frozen component with nothing hidden behind it', () => {
    const migration = sqlMigration('root:001', [SQL`SELECT 1`]);
    const child = schemaComponent();
    const root = schemaComponent({
      migrations: () => [migration],
      components: [child],
    });

    assert.strictEqual(Object.isFrozen(root), true);
    assert.deepStrictEqual(Object.getOwnPropertyNames(root), Object.keys(root));
    assert.deepStrictEqual(Object.getOwnPropertySymbols(root), [
      schemaComponentType,
    ]);

    const copy = { ...root };
    assert.strictEqual(copy[schemaComponentType], genericComponentType);
    assert.strictEqual(copy.components, root.components);
    assert.deepStrictEqual(copy.migrations(), [migration]);
  });

  it('keeps its own keys to the declared component shape', () => {
    assert.deepStrictEqual(Object.keys(schemaComponent()), [
      'components',
      'migrations',
    ]);
  });

  it('exposes migrations as a method and never as an accessor', () => {
    const component = schemaComponent({
      migrations: () => [sqlMigration('root:001', [SQL`SELECT 1`])],
      components: [tableComponent({ tableName: 'users' })],
    });

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

    assert.deepStrictEqual(eventStore.components, [
      eventStoreSchema,
      checkpoints,
    ]);
    assert.deepStrictEqual(database.components, [eventStore]);
    assert.strictEqual(
      database.extensions.eventStore.extensionName,
      'event-store',
    );
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
    assert.deepStrictEqual(schema.components, [audit]);
    assert.strictEqual(schema.extensions.audit.extensionName, 'audit');
  });

  it('applies a table placed under two extension aliases only once', () => {
    const migration = sqlMigration('users:001', [SQL`SELECT 1`]);
    const users = tableComponent({
      tableName: 'users',
      migrations: () => [migration],
    });
    const extension = extensionComponent('shared', {
      users,
      usersAgain: users,
    });

    assert.deepStrictEqual(extension.components, [users, users]);
    assert.deepStrictEqual(extension.migrations(), [migration]);
  });

  it('distinguishes an extension from a table without inspecting names', () => {
    const extension = extensionWith('audit');
    const table = tableComponent({ tableName: 'audit_log' });

    assert.strictEqual(extension[schemaComponentType], extensionComponentType);
    assert.strictEqual(isExtensionComponent(extension), true);
    assert.strictEqual(isExtensionComponent(table), false);
  });

  it('finds tables and extensions nested inside another extension', () => {
    const migration = sqlMigration('audit_log:001', [SQL`SELECT 1`]);
    const auditLog = tableComponent({
      tableName: 'audit_log',
      migrations: () => [migration],
    });
    const nested = extensionComponent('nested-audit', { auditLog });
    const audit = extensionComponent('audit', { nested });
    const schema = databaseSchemaComponent({
      schemaName: 'public',
      extensions: { audit },
    });

    assert.deepStrictEqual(Object.keys(schema.tables), []);
    assert.strictEqual(schema.extensions.audit.extensionName, 'audit');
    assert.deepStrictEqual(migrationNames(schema.migrations()), [
      'dumboSchema:public:001:create',
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
    assert.deepStrictEqual(database.components, [schema, eventStore]);
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
      'dumboSchema:crm:001:create',
      tableMigration.name,
      schemaExtensionMigration.name,
      databaseExtensionMigration.name,
    ]);
  });

  it('behaves the same when migrated directly or from a database root', () => {
    const migration = sqlMigration('audit:001', [SQL`SELECT 1`]);
    const auditLog = tableComponent({
      tableName: 'audit_log',
      migrations: () => [migration],
    });
    const audit = extensionComponent('audit', { auditLog });
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
    const declaration = databaseSchemaComponent({ schemaName: 'crm' });
    const database = databaseComponent({
      databaseName: 'app',
      schemas: { crm: declaration },
    });

    assert.deepStrictEqual(database.components, [database.schemas.crm]);
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
    assert.strictEqual(users.databaseSchemaName, undefined);
    assert.deepStrictEqual(database.components, [database.schemas.public]);
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

    assert.strictEqual(index.databaseSchemaName, undefined);
    assert.strictEqual(index.tableName, undefined);
    assert.strictEqual(contextualIndex.indexName, index.indexName);
    assert.strictEqual(contextualIndex.databaseSchemaName, undefined);
    assert.strictEqual(contextualIndex.tableName, undefined);
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

  it('rejects declaring a collection for one schema and putting it in another', () => {
    assert.throws(
      () =>
        databaseSchemaComponent({
          schemaName: 'public',
          tables: {
            users: tableComponent({
              tableName: 'users',
              databaseSchemaName: 'audit',
            }),
          },
        }),
      /constrained to database schema "audit".*cannot be placed in "public"/,
    );
  });

  it('lets a table declared for a schema be put in that same schema', () => {
    const users = tableComponent({
      tableName: 'users',
      databaseSchemaName: 'audit',
    });
    const schema = databaseSchemaComponent({
      schemaName: 'audit',
      tables: { users },
    });

    assert.strictEqual(schema.tables.users, users);
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
    assert.strictEqual(publicSchema.tables.users.tableName, 'users');
    assert.strictEqual(auditSchema.tables.users.tableName, 'users');
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
    const migration = sqlMigration('audit_log:001', [SQL`SELECT 1`]);
    const auditLog = tableComponent({
      tableName: 'audit_log',
      migrations: () => [migration],
    });
    const audit = extensionComponent('audit', { auditLog });
    const database = databaseComponent({
      databaseName: 'app',
      extensions: { audit },
    });

    assert.deepStrictEqual(database.migrations(), [migration]);
    assert.strictEqual(database.extensions.audit.extensionName, 'audit');
    assert.deepStrictEqual(Object.keys(database.schemas), []);
  });

  it('reports schema validation failure before executing migrations', async () => {
    const component = schemaComponent({
      migrations: () => [sqlMigration('root:001', [SQL`SELECT 1`])],
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
