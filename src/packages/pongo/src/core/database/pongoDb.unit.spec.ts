import {
  databaseSchemaComponent,
  DefaultDatabaseSchemaName,
  DumboError,
  dumboSchema,
  JSONSerializer,
  registerDefaultMigratorOptions,
  registerFormatter,
  SQL,
  SQLFormatter,
  SQLTableReference,
  type Abort,
  type AnyConnection,
  type ConnectionPool,
  type DatabaseTransactionOptions,
  type MigrationStyle,
  type SQLCommandOptions,
  type SQLExecutor,
  type SQLQueryOptions,
} from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { PongoCollectionSQLBuilder } from '../collection';
import { pongoSession } from '../pongoSession';
import type { CollectionOperationOptions, PongoCollection } from '../typing';
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
  drop: emptySQL,
};

registerFormatter(
  'test',
  SQLFormatter({
    format: () => ({ query: 'SELECT 1', params: [] }),
    describe: () => 'SELECT 1',
  }),
);
registerDefaultMigratorOptions('test', {});

type ExecutedCall = {
  method: keyof SQLExecutor;
  options: unknown;
};

const recordingExecutor = (
  calls: ExecutedCall[],
  rows: unknown[] = [],
): SQLExecutor =>
  ({
    query: (_sql: SQL, options?: unknown) => {
      calls.push({ method: 'query', options });
      return Promise.resolve({ rows });
    },
    batchQuery: (_sqls: SQL[], options?: unknown) => {
      calls.push({ method: 'batchQuery', options });
      return Promise.resolve([]);
    },
    command: (_sql: SQL, options?: unknown) => {
      calls.push({ method: 'command', options });
      return Promise.resolve({ rows, changes: 0 });
    },
    batchCommand: (_sqls: SQL[], options?: unknown) => {
      calls.push({ method: 'batchCommand', options });
      return Promise.resolve([]);
    },
  }) as unknown as SQLExecutor;

const createTestDb = <
  Definition extends PongoDbSchema = PongoDbSchema,
>(options?: {
  allowNestedTransactions?: boolean;
  autoMigration?: MigrationStyle;
  defaultSchemaName?: string;
  definition?: Definition;
  poolRows?: unknown[];
  transactionRows?: unknown[];
}) => {
  let transactionOptions: DatabaseTransactionOptions | undefined;
  let withTransactionOptions: DatabaseTransactionOptions | undefined;
  const poolCalls: ExecutedCall[] = [];
  const transactionCalls: ExecutedCall[] = [];
  const abort: Abort = {
    signal: new AbortController().signal,
  };

  const pool = {
    driverType: 'test:test',
    close: () => Promise.resolve(),
    connection: () => Promise.resolve({} as AnyConnection),
    withConnection: () => Promise.resolve(undefined),
    execute: recordingExecutor(poolCalls, options?.poolRows),
    transaction: (dumboTransactionOptions?: DatabaseTransactionOptions) => {
      transactionOptions = dumboTransactionOptions;
      return {
        begin: () => Promise.resolve(),
        commit: () => Promise.resolve(),
        rollback: () => Promise.resolve(),
        execute: recordingExecutor(transactionCalls, options?.transactionRows),
      } as unknown as ReturnType<ConnectionPool['transaction']>;
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
      ...(options?.autoMigration && { autoMigration: options.autoMigration }),
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
    poolCalls,
    transactionCalls,
  };
};

const assertThrowsPongoError = (
  operation: () => unknown,
  message: string,
): void => {
  assert.throws(operation, (error: unknown) => {
    assert.ok(DumboError.isInstanceOf(error));
    assert.strictEqual(error.errorType, 'PongoError');
    assert.strictEqual(error.errorCode, 500);
    assert.strictEqual(error.message, message);
    return true;
  });
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
    const projected = db;
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

    assertThrowsPongoError(
      () => db.collection('customerDirectory', { databaseSchemaName: 'crm' }),
      'Cannot add collection "customerDirectory" to database schema "crm" because that alias already refers to table "users"',
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

    assertThrowsPongoError(
      () => db.collection('users', { databaseSchemaName: 'crm' }),
      'Table "users" in database schema "crm" is not a Pongo collection',
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

  describe('with a session in a started transaction', () => {
    const startedSession = () => {
      const session = pongoSession();
      session.startTransaction();
      return session;
    };

    const assertRanOnlyOnTransaction = (
      { poolCalls, transactionCalls }: ReturnType<typeof createTestDb>,
      method: keyof SQLExecutor,
    ) => {
      assert.deepStrictEqual(poolCalls, []);
      assert.deepStrictEqual(
        transactionCalls.map((call) => call.method),
        [method],
      );
    };

    it('find with a non-id filter runs on the transaction', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = startedSession();

      await testDb.db
        .collection<{ _id: string; age: number }>('users')
        .find({ age: { $gte: 40 } }, { session });

      assertRanOnlyOnTransaction(testDb, 'query');
    });

    it('find with an id-only filter and skipCache runs on the transaction', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = startedSession();

      await testDb.db
        .collection<{ _id: string }>('users')
        .find({ _id: 'user-1' }, { session, skipCache: true });

      assertRanOnlyOnTransaction(testDb, 'query');
    });

    it('find with an id-only filter of uncached documents runs on the transaction', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = startedSession();

      await testDb.db
        .collection<{ _id: string }>('users')
        .find({ _id: 'user-1' }, { session });

      assertRanOnlyOnTransaction(testDb, 'query');
    });

    it('countDocuments runs on the transaction', async () => {
      const testDb = createTestDb({
        autoMigration: 'None',
        transactionRows: [{ count: 0 }],
      });
      const session = startedSession();

      const count = await testDb.db
        .collection<{ _id: string }>('users')
        .countDocuments({}, { session });

      assert.strictEqual(count, 0);
      assertRanOnlyOnTransaction(testDb, 'query');
    });

    it('handle reads an uncached document on the transaction', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = startedSession();

      await testDb.db
        .collection<{ _id: string }>('users')
        .handle('user-1', () => null, { session });

      assertRanOnlyOnTransaction(testDb, 'query');
    });

    it('drop runs on the transaction', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = startedSession();

      await testDb.db.collection<{ _id: string }>('users').drop({ session });

      assertRanOnlyOnTransaction(testDb, 'command');
    });
  });

  describe('with timeoutMS and abort', () => {
    type User = { _id: string; age: number };

    const abort: Abort = { signal: new AbortController().signal };

    const operations: [
      string,
      (
        users: PongoCollection<User>,
        options: CollectionOperationOptions,
      ) => Promise<unknown>,
    ][] = [
      ['find', (users, options) => users.find({ age: { $gte: 40 } }, options)],
      [
        'findOne',
        (users, options) => users.findOne({ age: { $gte: 40 } }, options),
      ],
      [
        'insertOne',
        (users, options) =>
          users.insertOne({ _id: 'user-1', age: 40 }, options),
      ],
      [
        'updateOne',
        (users, options) =>
          users.updateOne({ _id: 'user-1' }, { $set: { age: 41 } }, options),
      ],
      [
        'deleteOne',
        (users, options) => users.deleteOne({ _id: 'user-1' }, options),
      ],
      ['countDocuments', (users, options) => users.countDocuments({}, options)],
      [
        'sql.query',
        (users, options) => users.sql.query(SQL`SELECT 1`, options),
      ],
      [
        'sql.command',
        (users, options) => users.sql.command(SQL`SELECT 1`, options),
      ],
    ];

    const assertPassedTimeoutAndAbort = (calls: ExecutedCall[]) => {
      assert.ok(calls.length > 0);
      for (const call of calls) {
        const { mapping, ...rest } = call.options as SQLQueryOptions;
        assert.deepStrictEqual(rest, { timeoutMS: 50, abort });
        assert.deepStrictEqual(Object.keys(mapping ?? {}), [
          'data',
          '_version',
        ]);
      }
    };

    for (const [name, operation] of operations) {
      it(`${name} passes timeoutMS and abort to the executor`, async () => {
        const testDb = createTestDb({
          autoMigration: 'None',
          poolRows: [{ count: 0 }],
        });

        await operation(testDb.db.collection<User>('users'), {
          timeoutMS: 50,
          abort,
        });

        assertPassedTimeoutAndAbort(testDb.poolCalls);
        assert.deepStrictEqual(testDb.transactionCalls, []);
      });

      it(`${name} with a session passes timeoutMS and abort to the transaction`, async () => {
        const testDb = createTestDb({
          autoMigration: 'None',
          transactionRows: [{ count: 0 }],
        });
        const session = pongoSession();
        session.startTransaction();

        await operation(testDb.db.collection<User>('users'), {
          session,
          timeoutMS: 50,
          abort,
        });

        assertPassedTimeoutAndAbort(testDb.transactionCalls);
        assert.deepStrictEqual(testDb.poolCalls, []);
      });

      it(`${name} with a session passes defaultTimeoutMS of the session as timeoutMS to the executor`, async () => {
        const testDb = createTestDb({
          autoMigration: 'None',
          poolRows: [{ count: 0 }],
        });
        const session = pongoSession({ defaultTimeoutMS: 50 });

        await operation(testDb.db.collection<User>('users'), {
          session,
          abort,
        });

        assertPassedTimeoutAndAbort(testDb.poolCalls);
      });
    }

    it('an operation with timeoutMS overrides defaultTimeoutMS of its session', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = pongoSession({ defaultTimeoutMS: 1000 });

      await testDb.db
        .collection<User>('users')
        .find({ age: { $gte: 40 } }, { session, timeoutMS: 50, abort });

      assertPassedTimeoutAndAbort(testDb.poolCalls);
    });

    it('the first operation on a new collection passes defaultTimeoutMS of its session to its migration', async () => {
      const testDb = createTestDb();
      const session = pongoSession({ defaultTimeoutMS: 50 });

      await testDb.db
        .collection<User>('users')
        .find({ age: { $gte: 40 } }, { session });

      const migrationCommands = testDb.poolCalls.filter(
        (call) => call.method === 'batchCommand',
      );
      assert.ok(migrationCommands.length > 0);
      for (const call of migrationCommands)
        assert.strictEqual((call.options as SQLCommandOptions).timeoutMS, 50);
    });

    it('a transaction started in a session with defaultTimeoutMS passes it to the database transaction as statementTimeoutMS', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = pongoSession({ defaultTimeoutMS: 50 });
      session.startTransaction();

      await testDb.db
        .collection<User>('users')
        .find({ age: { $gte: 40 } }, { session });

      assert.strictEqual(testDb.transactionOptions()?.statementTimeoutMS, 50);
      for (const call of testDb.transactionCalls)
        assert.strictEqual(
          (call.options as SQLQueryOptions).timeoutMS,
          undefined,
        );
    });

    it('a transaction started with timeoutMS overrides defaultTimeoutMS of its session', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = pongoSession({ defaultTimeoutMS: 1000 });
      session.startTransaction({ timeoutMS: 50 });

      await testDb.db
        .collection<User>('users')
        .find({ age: { $gte: 40 } }, { session });

      assert.strictEqual(testDb.transactionOptions()?.statementTimeoutMS, 50);
    });

    it('insertOne and updateOne keep session, skipCache, upsert and expectedVersion away from the executor', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = pongoSession();
      session.startTransaction();
      const users = testDb.db.collection<User>('users');

      await users.insertOne(
        { _id: 'user-1', age: 40 },
        {
          session,
          skipCache: true,
          upsert: true,
          expectedVersion: 'DOCUMENT_DOES_NOT_EXIST',
          timeoutMS: 50,
          abort,
        },
      );
      await users.updateOne(
        { _id: 'user-1' },
        { $set: { age: 41 } },
        {
          session,
          skipCache: true,
          expectedVersion: 1n,
          timeoutMS: 50,
          abort,
        },
      );

      assertPassedTimeoutAndAbort(testDb.transactionCalls);
    });

    it('the first operation on a new collection passes timeoutMS to its migration', async () => {
      const testDb = createTestDb();

      await testDb.db
        .collection<User>('users')
        .find({ age: { $gte: 40 } }, { timeoutMS: 50 });

      const migrationCommands = testDb.poolCalls.filter(
        (call) => call.method === 'batchCommand',
      );
      assert.ok(migrationCommands.length > 0);
      for (const call of migrationCommands)
        assert.strictEqual((call.options as SQLCommandOptions).timeoutMS, 50);
    });

    it('a transaction started with timeoutMS passes it to the database transaction as statementTimeoutMS', async () => {
      const testDb = createTestDb({ autoMigration: 'None' });
      const session = pongoSession();
      session.startTransaction({
        timeoutMS: 50,
      });

      await testDb.db
        .collection<User>('users')
        .find({ age: { $gte: 40 } }, { session });

      assert.strictEqual(testDb.transactionOptions()?.statementTimeoutMS, 50);
    });
  });
});
