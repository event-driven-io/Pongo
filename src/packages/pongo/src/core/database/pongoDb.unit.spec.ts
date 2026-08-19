import {
  databaseSchemaComponent,
  DefaultDatabaseSchemaName,
  dumboSchema,
  JSONSerializer,
  SQL,
  SQLTableReference,
  type Abort,
  type AnyConnection,
  type ConnectionPool,
  type DatabaseTransactionOptions,
} from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { PongoCollectionSQLBuilder } from '../collection';
import {
  pongoSchema,
  type PongoDbSchema,
  type PongoDbWithSchema,
} from '../schema';
import { PongoDatabase } from './pongoDb';

const migrationNames = (migrations: ReadonlyArray<{ name: string }>) =>
  migrations.map(({ name }) => name);

const emptySQL = () => SQL``;
const stubSQLBuilder: PongoCollectionSQLBuilder = {
  createCollection: () => [SQL``],
  insertOne: emptySQL,
  insertMany: emptySQL,
  insertOrReplace: emptySQL,
  updateOne: emptySQL,
  replaceOne: emptySQL,
  updateMany: emptySQL,
  deleteOne: emptySQL,
  deleteMany: emptySQL,
  replaceMany: emptySQL,
  deleteManyByIds: emptySQL,
  findOne: emptySQL,
  find: emptySQL,
  countDocuments: emptySQL,
  rename: emptySQL,
  drop: emptySQL,
};

const createTestDb = <
  Definition extends PongoDbSchema = PongoDbSchema,
>(options?: {
  allowNestedTransactions?: boolean;
  defaultSchemaName?: string;
  definition?: Definition;
}) => {
  let transactionOptions: DatabaseTransactionOptions | undefined;
  let withTransactionOptions: DatabaseTransactionOptions | undefined;
  const abort: Abort = {
    signal: new AbortController().signal,
  };

  const pool = {
    driverType: 'test:test',
    close: () => Promise.resolve(),
    connection: () => Promise.resolve({} as AnyConnection),
    withConnection: () => Promise.resolve(undefined),
    execute: {
      query: () => Promise.resolve({ rows: [] }),
      batchQuery: () => Promise.resolve([]),
      command: () => Promise.resolve({ rows: [], changes: 0 }),
      batchCommand: () => Promise.resolve([]),
    },
    transaction: (options?: DatabaseTransactionOptions) => {
      transactionOptions = options;
      return {} as ReturnType<ConnectionPool['transaction']>;
    },
    withTransaction: async (
      handle: Parameters<ConnectionPool['withTransaction']>[0],
      options?: DatabaseTransactionOptions,
    ) => {
      withTransactionOptions = options;
      return handle(
        { execute: pool.execute } as ReturnType<ConnectionPool['transaction']>,
        { abort },
      );
    },
  } as unknown as ConnectionPool;

  const db = PongoDatabase<PongoDbWithSchema<Definition>>({
    databaseName: 'test',
    pool,
    serializer: JSONSerializer,
    defaultSchemaName: options?.defaultSchemaName,
    transactionOptions: options,
    schema: {
      definition:
        options?.definition ??
        pongoSchema.db('test', {
          collections: {},
        }),
    },
    sqlBuilderFor: () => stubSQLBuilder,
  });

  return {
    db,
    transactionOptions: () => transactionOptions,
    withTransactionOptions: () => withTransactionOptions,
  };
};

describe('using a Pongo database', () => {
  it('accepts database schema and document schema settings together', () => {
    const { db } = createTestDb();

    const collection = db.collection<
      { _id: string; displayName: string },
      { _id: string; name: string }
    >('users', {
      databaseSchemaName: 'crm',
      schema: {
        versioning: {
          upcast: (stored) => ({
            _id: stored._id,
            displayName: stored.name,
          }),
          downcast: (document) => ({
            _id: document._id,
            name: document.displayName,
          }),
        },
      },
    });

    assert.strictEqual(collection.schema.component.tableName, 'users');
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
    ]);
  });

  it('opens an undeclared collection in the default schema', () => {
    const { db } = createTestDb();
    const initial = db.schema.component;

    const users = db.collection('users');

    assert.notStrictEqual(db.schema.component, initial);
    assert.strictEqual(
      db.schema.component.defaultSchema.schemaName,
      DefaultDatabaseSchemaName,
    );
    assert.strictEqual(
      db.schema.component.tables.users,
      users.schema.component,
    );
    assert.strictEqual(users.schema.component.tableName, 'users');
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'table:pongo_collection:users:create',
    ]);
  });

  it('opens an undeclared collection in a named schema without mutating the reusable definition', () => {
    const definition = pongoSchema.db('test', { collections: {} });
    const { db } = createTestDb({ definition });
    const initial = db.schema.component;

    assert.deepStrictEqual(migrationNames(db.schema.migrations), []);

    const entries = db.collection('entries', {
      databaseSchemaName: 'audit',
    });

    assert.notStrictEqual(db.schema.component, initial);
    assert.strictEqual(
      db.schema.component.schemas.audit?.tables.entries,
      entries.schema.component,
    );
    assert.deepStrictEqual(
      entries.schema.component.migrations().map((migration) => migration.name),
      ['table:pongo_collection:audit:entries:create'],
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:audit:create',
      'table:pongo_collection:audit:entries:create',
    ]);
    assert.deepStrictEqual(Object.keys(definition.schemas), [
      DefaultDatabaseSchemaName,
    ]);
    assert.deepStrictEqual(Object.keys(definition.tables), []);
  });

  it('reuses the component and runtime collection on repeated access', () => {
    const { db } = createTestDb();

    const collection = db.collection('users', {
      databaseSchemaName: 'crm',
    });
    const registered = db.schema.component;
    const repeated = db.collection('users', {
      databaseSchemaName: 'crm',
    });

    assert.strictEqual(collection, repeated);
    assert.strictEqual(collection.collectionName, 'users');
    assert.strictEqual(collection.schema.component, repeated.schema.component);
    assert.strictEqual('migrations' in collection.schema, false);
    assert.strictEqual(db.schema.component, registered);
    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.users,
      collection.schema.component,
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
    ]);
  });

  it('accumulates collections added to the same named schema', () => {
    const { db } = createTestDb();

    const users = db.collection('users', { databaseSchemaName: 'crm' });
    const orders = db.collection('orders', { databaseSchemaName: 'crm' });

    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.users,
      users.schema.component,
    );
    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.orders,
      orders.schema.component,
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
      'table:pongo_collection:crm:orders:create',
    ]);
  });

  it('keeps default and schema-qualified collections distinct', () => {
    const { db } = createTestDb();

    const defaultUsers = db.collection('users');
    const explicitDefaultUsers = db.collection('users', {
      databaseSchemaName: 'public',
    });
    const crmUsers = db.collection('users', {
      databaseSchemaName: 'crm',
    });

    assert.notStrictEqual(defaultUsers, explicitDefaultUsers);
    assert.notStrictEqual(defaultUsers, crmUsers);
    assert.strictEqual(db.collections().length, 3);
    assert.strictEqual(
      db.schema.component.tables.users,
      defaultUsers.schema.component,
    );
    assert.strictEqual(
      db.schema.component.schemas.public?.tables.users,
      explicitDefaultUsers.schema.component,
    );
    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.users,
      crmUsers.schema.component,
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'table:pongo_collection:users:create',
      'schema:public:create',
      'table:pongo_collection:public:users:create',
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
    ]);
  });

  it('searches a configured default schema and a schema of that name as one namespace', () => {
    const users = pongoSchema.collection('users');
    const { db } = createTestDb({
      defaultSchemaName: 'crm',
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', { crmUsers: users }),
        },
      }),
    });

    const declared = db.schema.component.schemas.crm?.tables.crmUsers;

    assert.strictEqual(db.collection('users').schema.component, declared);
    assert.strictEqual(
      db.collection('users', { databaseSchemaName: 'crm' }).schema.component,
      declared,
    );
    assert.strictEqual(
      db.collection('orders').schema.component.tableName,
      'orders',
    );
    assert.strictEqual(db.schema.component.tables.orders?.tableName, 'orders');
    assert.deepStrictEqual(
      declared?.fullName,
      SQLTableReference.from({
        databaseSchemaName: 'crm',
        tableName: 'users',
      }),
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:orders:create',
      'table:pongo_collection:crm:users:create',
    ]);
    assert.ok(
      migrationNames(db.schema.migrations).includes(
        'table:pongo_collection:crm:orders:create',
      ),
    );
  });

  it("db.collection('users') and db.collection('users', { databaseSchemaName: 'crm' }) return the same collection when crm is the default schema", () => {
    const { db } = createTestDb({ defaultSchemaName: 'crm' });

    const implicit = db.collection('users');
    const explicit = db.collection('users', { databaseSchemaName: 'crm' });

    assert.strictEqual(implicit, explicit);
    assert.deepStrictEqual(db.collections(), [implicit]);
  });

  it('resolves the default database schema name to the default schema', () => {
    const { db } = createTestDb({ defaultSchemaName: 'crm' });

    const implicit = db.collection('users');
    const spelledOut = db.collection('users', {
      databaseSchemaName: DefaultDatabaseSchemaName,
    });

    assert.strictEqual(spelledOut, implicit);
    assert.deepStrictEqual(db.collections(), [implicit]);
  });

  it("db.collection('users', { cache: 'disabled' }) does not replace db.collection('users')", () => {
    const { db } = createTestDb();

    const standard = db.collection('users');
    const configured = db.collection('users', { cache: 'disabled' });

    assert.notStrictEqual(configured, standard);
    assert.strictEqual(db.collection('users'), standard);
    assert.deepStrictEqual(db.collections(), [standard]);
  });

  it('includes one schema creation migration for each dynamically added named schema', () => {
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {
            users: pongoSchema.collection('users'),
          }),
        },
      }),
    });

    db.collection('orders', { databaseSchemaName: 'crm' });
    db.collection('entries', { databaseSchemaName: 'audit' });

    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
      'table:pongo_collection:crm:orders:create',
      'schema:audit:create',
      'table:pongo_collection:audit:entries:create',
    ]);
  });

  it('reports conflicting users collections when crm combines default and named schema declarations', () => {
    assert.throws(
      () =>
        createTestDb({
          defaultSchemaName: 'crm',
          definition: pongoSchema
            .db('test', {
              collections: {
                users: pongoSchema.collection('users'),
              },
            })
            .withSchema({
              crm: pongoSchema.schema('crm', {
                crmUsers: pongoSchema.collection('users'),
              }),
            }),
        }),
      /Table "users" is declared more than once in database schema "crm"/,
    );
  });

  it('accesses a collection declared in a named schema', () => {
    const users = pongoSchema.collection('users');
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          audit: pongoSchema.schema('audit', { auditUsers: users }),
        },
      }),
    });

    assert.strictEqual(
      db.audit.auditUsers,
      db.collection('users', { databaseSchemaName: 'audit' }),
    );
    assert.strictEqual(
      db.schema.component.schemas.audit?.tables.auditUsers?.tableName,
      users.tableName,
    );
    assert.deepStrictEqual(Object.keys(db.schema.component.tables), []);
  });

  it('accesses default collections and named schemas on the same database', () => {
    const { db } = createTestDb({
      definition: pongoSchema
        .db('test', {
          collections: {
            users: pongoSchema.collection('users'),
          },
        })
        .withSchema({
          crm: pongoSchema.schema('crm', {
            customers: pongoSchema.collection('customers'),
          }),
        }),
    });

    assert.strictEqual(db.users, db.collection('users'));
    assert.strictEqual(
      db.crm.customers,
      db.collection('customers', { databaseSchemaName: 'crm' }),
    );
  });

  it('opens a declared collection only when its property is accessed', () => {
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        collections: {
          users: pongoSchema.collection('users'),
        },
      }),
    });

    assert.deepStrictEqual(db.collections(), []);

    const users = db.users;

    assert.deepStrictEqual(db.collections(), [users]);
  });

  it('preserves declared schema and collection identity across property access', () => {
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {
            users: pongoSchema.collection('users'),
          }),
        },
      }),
    });

    assert.strictEqual(db.crm, db.crm);
    assert.strictEqual(db.crm.users, db.crm.users);
  });

  it('two schemas can project the same collection alias independently', () => {
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {
            users: pongoSchema.collection('users'),
          }),
          audit: pongoSchema.schema('audit', {
            users: pongoSchema.collection('users'),
          }),
        },
      }),
    });

    assert.notStrictEqual(db.crm.users, db.audit.users);
    assert.strictEqual(
      db.crm.users,
      db.collection('users', { databaseSchemaName: 'crm' }),
    );
    assert.strictEqual(
      db.audit.users,
      db.collection('users', { databaseSchemaName: 'audit' }),
    );
  });

  it('a plain Dumbo relational table is not projected', () => {
    const { db } = createTestDb({
      definition: dumboSchema.database('test', {
        tables: {
          accounts: dumboSchema.table('accounts'),
        },
      }),
    });

    assert.strictEqual('accounts' in db, false);
  });

  it("db.collection('schema') opens a declared collection named schema", () => {
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        collections: { schema: pongoSchema.collection('schema') },
      }),
    });

    assert.strictEqual(db.schema.component.tables.schema?.tableName, 'schema');
    assert.strictEqual(
      db.collection('schema').schema.component,
      db.schema.component.tables.schema,
    );
  });

  it('accesses a collection added at runtime as a database property', () => {
    const { db } = createTestDb();

    const entries = db.collection('entries');
    const runtimeDb = db as typeof db & { entries: typeof entries };

    assert.strictEqual(runtimeDb.entries, entries);
    assert.strictEqual(
      db.schema.component.tables.entries?.tableName,
      'entries',
    );
  });

  it('accesses a schema and collection added at runtime as database properties', () => {
    const { db } = createTestDb();

    const entries = db.collection('entries', {
      databaseSchemaName: 'audit',
    });
    const runtimeDb = db as typeof db & {
      audit: { entries: typeof entries };
    };

    assert.strictEqual(runtimeDb.audit, runtimeDb.audit);
    assert.strictEqual(runtimeDb.audit.entries, entries);
  });

  it('reuses a declared collection when its alias differs from its table name', () => {
    const users = pongoSchema.collection('users');
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {
            customerDirectory: users,
          }),
        },
      }),
    });
    const projected = db as typeof db & {
      crm: {
        customerDirectory: ReturnType<typeof db.collection>;
      };
    };
    const direct = db.collection('users', {
      databaseSchemaName: 'crm',
    });

    assert.strictEqual(projected.crm.customerDirectory, direct);
    assert.strictEqual(direct.schema.component.tableName, users.tableName);
    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.customerDirectory?.tableName,
      users.tableName,
    );
  });

  it("db.collection('customerDirectory', { databaseSchemaName: 'crm' }) does not replace the application's customerDirectory alias for users", () => {
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {
            customerDirectory: pongoSchema.collection('users'),
          }),
        },
      }),
    });

    assert.throws(
      () => db.collection('customerDirectory', { databaseSchemaName: 'crm' }),
      /alias already refers to table "users"/,
    );
  });

  it('reuses a collection declared in a schema aliased under another key', () => {
    const users = pongoSchema.collection('users');
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: { reporting: pongoSchema.schema('crm', { users }) },
      }),
    });

    assert.strictEqual(
      db.collection('users', { databaseSchemaName: 'crm' }).schema.component,
      db.schema.component.schemas.reporting?.tables.users,
    );
  });

  it('reuses a collection declared by a table extension attached to a named schema', () => {
    const users = pongoSchema.collection('users');
    const crmExtension = dumboSchema.extension('crm-extension', {
      tables: { users },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {}, { crmExtension }),
        },
      }),
    });

    const collection = db.collection('users', { databaseSchemaName: 'crm' });

    assert.strictEqual(
      collection.schema.component,
      db.schema.component.schemas.crm?.extensions.crmExtension?.tables.users,
    );
    assert.deepStrictEqual(
      Object.keys(db.schema.component.schemas.crm?.tables ?? {}),
      ['users'],
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
    ]);
  });

  it('exposes a collection declared by a table extension attached to a named schema', () => {
    const users = pongoSchema.collection('users');
    const crmExtension = dumboSchema.extension('crm-extension', {
      tables: { users },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {}, { crmExtension }),
        },
      }),
    });

    assert.strictEqual(
      db.crm.users,
      db.collection('users', { databaseSchemaName: 'crm' }),
    );
  });

  it('reuses a collection declared by a table extension bound to the default schema', () => {
    const users = pongoSchema.collection('users');
    const eventStore = dumboSchema.extension('event-store', {
      tables: { users },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', { schemas: {} }, { eventStore }),
    });

    const collection = db.collection('users');

    assert.strictEqual(collection.schema.component, users);
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'table:pongo_collection:users:create',
    ]);
  });

  it('reports conflicting users collections from the crm schema and its extension', () => {
    const crmExtension = dumboSchema.extension('crm-extension', {
      tables: { users: pongoSchema.collection('users') },
    });

    assert.throws(
      () =>
        createTestDb({
          definition: pongoSchema.db('test', {
            schemas: {
              crm: pongoSchema.schema(
                'crm',
                { users: pongoSchema.collection('users') },
                { crmExtension },
              ),
            },
          }),
        }),
      /Table "users" is declared more than once in database schema "crm"/,
    );
  });

  it("db.collection('users', { databaseSchemaName: 'crm' }) does not open a Pongo collection over an extension's relational users table", () => {
    const legacy = dumboSchema.extension('legacy', {
      tables: {
        users: dumboSchema.table('users', {
          columns: {
            id: dumboSchema.column('id', SQL.column.type.Text, {
              primaryKey: true,
            }),
          },
        }),
      },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: { crm: pongoSchema.schema('crm', {}, { legacy }) },
      }),
    });

    assert.throws(
      () => db.collection('users', { databaseSchemaName: 'crm' }),
      /Table "users" in database schema "crm" is not a Pongo collection/,
    );
  });

  it('registers an undeclared collection on a database that has an extension', () => {
    const eventStore = dumboSchema.extension('event-store', {
      schemas: {
        readmodels: dumboSchema.schema('readmodels', {
          summaries: pongoSchema.collection('summaries'),
        }),
      },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', { schemas: {} }, { eventStore }),
    });

    const collection = db.collection('users', { databaseSchemaName: 'crm' });

    assert.strictEqual(collection.collectionName, 'users');
    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.users,
      collection.schema.component,
    );
    assert.ok(
      migrationNames(db.schema.migrations).includes(
        'table:pongo_collection:crm:users:create',
      ),
    );
    assert.ok(
      migrationNames(db.schema.migrations).includes(
        'table:pongo_collection:readmodels:summaries:create',
      ),
    );
  });

  it('adds a direct schema beside an extension-contributed schema', () => {
    const eventStore = dumboSchema.extension('event-store', {
      schemas: {
        readmodels: databaseSchemaComponent({
          schemaName: 'readmodels',
          kind: 'event_store',
          tables: {
            summaries: pongoSchema.collection('summaries'),
          },
        }),
      },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', { schemas: {} }, { eventStore }),
    });

    db.collection('orders', { databaseSchemaName: 'readmodels' });

    assert.strictEqual(
      db.schema.component.schemas.readmodels?.tables.orders?.tableName,
      'orders',
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:readmodels:create',
      'table:pongo_collection:readmodels:orders:create',
      'schema:event_store:readmodels:create',
      'table:pongo_collection:readmodels:summaries:create',
    ]);
  });

  it('starts transactions with nested transactions enabled while preserving savepoints', () => {
    const { db, transactionOptions } = createTestDb();

    db.transaction({
      useSavepoints: true,
    });

    assert.deepStrictEqual(transactionOptions(), {
      allowNestedTransactions: true,
      useSavepoints: true,
    });
  });

  it('runs withTransaction with nested transactions enabled while preserving savepoints', async () => {
    const { db, withTransactionOptions } = createTestDb();

    await db.withTransaction(() => Promise.resolve(undefined), {
      useSavepoints: true,
    });

    assert.deepStrictEqual(withTransactionOptions(), {
      allowNestedTransactions: true,
      useSavepoints: true,
    });
  });

  it('respects explicitly disabled nested transactions', async () => {
    const { db, transactionOptions, withTransactionOptions } = createTestDb();

    db.transaction({
      allowNestedTransactions: false,
      useSavepoints: true,
    });

    await db.withTransaction(() => Promise.resolve(undefined), {
      allowNestedTransactions: false,
      useSavepoints: true,
    });

    assert.deepStrictEqual(transactionOptions(), {
      allowNestedTransactions: false,
      useSavepoints: true,
    });
    assert.deepStrictEqual(withTransactionOptions(), {
      allowNestedTransactions: false,
      useSavepoints: true,
    });
  });

  it('respects explicitly disabled nested transactions from database options', async () => {
    const { db, transactionOptions, withTransactionOptions } = createTestDb({
      allowNestedTransactions: false,
    });

    db.transaction();
    await db.withTransaction(() => Promise.resolve(undefined));

    assert.deepStrictEqual(transactionOptions(), {
      allowNestedTransactions: false,
    });
    assert.deepStrictEqual(withTransactionOptions(), {
      allowNestedTransactions: false,
    });
  });
});
