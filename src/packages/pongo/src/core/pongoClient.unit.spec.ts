import assert from 'node:assert';
import type { DatabaseDriverType } from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import type { PongoDatabaseFactoryOptions, PongoDriver } from './drivers';
import { pongoClient } from './pongoClient';
import { pongoSchema, projectPongoDb } from './schema';
import type {
  PongoCollection,
  PongoDBCollectionOptions,
  PongoDb,
  PongoDocument,
} from './typing';

type TestDriverType = DatabaseDriverType<'Test'>;
const TestDriverType: TestDriverType = 'Test:fake';

const testPongoDb = (options: {
  databaseName: string;
  onConnect: (databaseName: string) => void;
  onClose: (databaseName: string) => void;
}): PongoDb<TestDriverType> => {
  const schema = Object.assign(
    () => ({
      collection: () => ({}) as never,
      collections: () => [],
    }),
    {
      component: {} as never,
      definition: pongoSchema.db({ collections: {} }),
      migrations: [],
      migrate: () => Promise.resolve({ applied: [], skipped: [] }),
    },
  );

  return {
    driverType: TestDriverType,
    databaseName: options.databaseName,
    connect: () => {
      options.onConnect(options.databaseName);
      return Promise.resolve();
    },
    close: () => {
      options.onClose(options.databaseName);
      return Promise.resolve();
    },
    collection: () =>
      ({
        close: () => Promise.resolve(),
      }) as never,
    collections: () => [],
    transaction: () => ({}) as never,
    withTransaction: () => Promise.resolve(undefined as never),
    schema,
    sql: {
      query: () => Promise.resolve([]),
      command: () => Promise.resolve({ rows: [], rowCount: 0, changes: 0 }),
    },
  };
};

type TestPongoDriverOptions = {
  connectionString?: string;
  connectionOptions?: {
    connection?: { id: string };
    transactionOptions?: {
      allowNestedTransactions?: boolean;
      useSavepoints?: boolean;
    };
  };
};

const testPongoDriver = ({
  supportsMultipleDatabases = true,
  parseDatabaseName = (connectionString?: string) =>
    connectionString ? 'parsed-default' : undefined,
}: {
  supportsMultipleDatabases?: boolean;
  parseDatabaseName?: (connectionString?: string) => string | undefined;
} = {}) => {
  const databaseFactoryCalls: PongoDatabaseFactoryOptions[] = [];
  const connected: string[] = [];
  const closed: string[] = [];

  const driver = {
    driverType: TestDriverType,
    dumboDriver: {
      driverType: TestDriverType,
      databaseMetadata: {
        databaseType: 'Test',
        defaultDatabaseName: 'driver-default',
        defaultSchemaName: 'native',
        capabilities: {
          supportsMultipleDatabases,
          supportsSchemas: true,
          supportsFunctions: false,
        },
        parseDatabaseName,
        tableExists: () => Promise.resolve(false),
      },
    } as never,
    databaseFactory: (options) => {
      databaseFactoryCalls.push(options);
      if (options.databaseName === undefined) {
        throw new Error('Expected the database name to be resolved');
      }

      return testPongoDb({
        databaseName: options.databaseName,
        onConnect: (databaseName) => connected.push(databaseName),
        onClose: (databaseName) => closed.push(databaseName),
      });
    },
  } satisfies PongoDriver<PongoDb<TestDriverType>, TestPongoDriverOptions>;

  return {
    driver,
    databaseFactoryCalls,
    connected,
    closed,
  };
};

describe('pongoClient', () => {
  it('requires resolved names at the internal driver boundary', () => {
    type FactoryOptions = Parameters<
      PongoDriver<PongoDb<TestDriverType>>['databaseFactory']
    >[0];

    expectTypeOf<FactoryOptions['databaseName']>().toEqualTypeOf<string>();
    expectTypeOf<FactoryOptions['defaultSchemaName']>().toEqualTypeOf<string>();
  });

  it('resolves client database and default schema settings once', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const client = pongoClient({
      driver,
      databaseName: 'application',
      defaultSchemaName: 'public',
    });

    client.db();

    assert.strictEqual(databaseFactoryCalls[0]?.databaseName, 'application');
    assert.strictEqual(databaseFactoryCalls[0]?.defaultSchemaName, 'public');
  });

  it('allows database settings to override client defaults', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const client = pongoClient({
      driver,
      databaseName: 'application',
      defaultSchemaName: 'public',
    });

    client.db('reporting', { defaultSchemaName: 'analytics' });

    assert.strictEqual(databaseFactoryCalls[0]?.databaseName, 'reporting');
    assert.strictEqual(databaseFactoryCalls[0]?.defaultSchemaName, 'analytics');
  });

  it('uses a declared database name before driver metadata', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const client = pongoClient({
      driver,
      connectionString: 'test://connection',
      schema: {
        definition: pongoSchema.db('declared', { collections: {} }),
      },
    });

    client.db();

    assert.strictEqual(databaseFactoryCalls[0]?.databaseName, 'declared');
  });

  it('uses connection metadata before the driver database default', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const parsedClient = pongoClient({
      driver,
      connectionString: 'test://connection',
    });

    parsedClient.db();
    assert.strictEqual(databaseFactoryCalls[0]?.databaseName, 'parsed-default');

    const fallback = testPongoDriver({
      parseDatabaseName: () => undefined,
    });
    pongoClient({ driver: fallback.driver }).db();
    assert.strictEqual(
      fallback.databaseFactoryCalls[0]?.databaseName,
      'driver-default',
    );
  });

  it('uses metadata defaults for a fixed-database driver', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver({
      supportsMultipleDatabases: false,
    });

    pongoClient({ driver }).db();

    assert.strictEqual(databaseFactoryCalls[0]?.databaseName, 'driver-default');
    assert.strictEqual(databaseFactoryCalls[0]?.defaultSchemaName, 'native');
  });

  it('resolves migration-table settings with database precedence', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const client = pongoClient({
      driver,
      migrationTable: { tableName: 'client_migrations' },
    });

    client.db('reporting', {
      migrationTable: { tableName: 'reporting_migrations' },
    });

    assert.deepStrictEqual(databaseFactoryCalls[0]?.migrationTable, {
      tableName: 'reporting_migrations',
    });
  });

  it('keeps typed client schema access', () => {
    type User = PongoDocument & { email: string };
    const { driver } = testPongoDriver();
    const schema = pongoSchema.client({
      app: pongoSchema.db('app', {
        collections: {
          users: pongoSchema.collection<User>('users'),
        },
      }),
    });

    const _client = pongoClient({
      driver,
      schema: { definition: schema },
    });

    type Client = typeof _client;

    expectTypeOf<Client['app']['users']>().toEqualTypeOf<
      PongoCollection<User>
    >();
  });

  it('keeps typed database and schema access', () => {
    type User = PongoDocument & { email: string };
    type Audit = PongoDocument & { reason: string };
    const { driver } = testPongoDriver();
    const schema = pongoSchema.db('app', {
      schemas: {
        crm: pongoSchema.schema('crm', {
          users: pongoSchema.collection<User>('users'),
        }),
        audit: pongoSchema.schema('audit', {
          auditLogs: pongoSchema.collection<Audit>('audit_logs'),
        }),
      },
    });

    const _client = pongoClient({
      driver,
      schema: { definition: schema },
    });

    type Client = typeof _client;

    expectTypeOf<Client['app']['crm']['users']>().toEqualTypeOf<
      PongoCollection<User>
    >();
    expectTypeOf<Client['app']['audit']['auditLogs']>().toEqualTypeOf<
      PongoCollection<Audit>
    >();
  });

  it('projects database schema collections with their schema names', () => {
    type User = PongoDocument & { email: string };
    const collectionCalls: { name: string; schema?: string | undefined }[] = [];
    const db = {
      ...testPongoDb({
        databaseName: 'app',
        onConnect: () => undefined,
        onClose: () => undefined,
      }),
      collection: <T extends PongoDocument, Payload extends PongoDocument = T>(
        name: string,
        options?: PongoDBCollectionOptions<T, Payload>,
      ) => {
        const schema = options?.databaseSchemaName;

        collectionCalls.push({ name, schema });
        return { name, schema } as never;
      },
    };
    const schema = pongoSchema.db('app', {
      schemas: {
        crm: pongoSchema.schema('crm', {
          users: pongoSchema.collection<User>('users'),
        }),
      },
    });
    const projected = projectPongoDb(db, schema);

    assert.deepStrictEqual(projected.crm.users, {
      name: 'users',
      schema: 'crm',
    });
    assert.deepStrictEqual(collectionCalls, [{ name: 'users', schema: 'crm' }]);
    type Projected = typeof projected;

    expectTypeOf<Projected['crm']['users']>().toEqualTypeOf<
      PongoCollection<User>
    >();
  });

  it('rejects projected aliases that conflict with the actual database API', () => {
    const db = testPongoDb({
      databaseName: 'app',
      onConnect: () => undefined,
      onClose: () => undefined,
    });

    assert.throws(
      () =>
        projectPongoDb(
          db,
          pongoSchema.db({
            collections: {
              schema: pongoSchema.collection('schema'),
            },
          }),
        ),
      /collection name schema conflicts with a database API member/,
    );
    assert.throws(
      () =>
        projectPongoDb(
          db,
          pongoSchema.db({
            schemas: {
              collection: pongoSchema.schema({}),
            },
          }),
        ),
      /schema name collection conflicts with a database API member/,
    );
  });

  it('keeps duplicate schema-group collection aliases scoped at runtime', () => {
    type User = PongoDocument & { email: string };
    const db = {
      ...testPongoDb({
        databaseName: 'app',
        onConnect: () => undefined,
        onClose: () => undefined,
      }),
      collection: <T extends PongoDocument, Payload extends PongoDocument = T>(
        name: string,
        options?: PongoDBCollectionOptions<T, Payload>,
      ) =>
        ({
          name,
          schema: options?.databaseSchemaName,
        }) as never,
    };
    const schema = pongoSchema.db('app', {
      schemas: {
        crm: pongoSchema.schema('crm', {
          users: pongoSchema.collection<User>('users'),
        }),
        audit: pongoSchema.schema('audit', {
          users: pongoSchema.collection<User>('users'),
        }),
      },
    });
    const projected = projectPongoDb(db, schema);

    assert.strictEqual(
      (projected as unknown as Record<string, unknown>).users,
      undefined,
    );
    assert.deepStrictEqual(projected.crm.users, {
      name: 'users',
      schema: 'crm',
    });
    assert.deepStrictEqual(projected.audit.users, {
      name: 'users',
      schema: 'audit',
    });
  });

  it('projects direct collection aliases onto the database object', () => {
    const calls: string[] = [];
    const base = testPongoDb({
      databaseName: 'app',
      onConnect: () => undefined,
      onClose: () => undefined,
    });
    const db = {
      ...base,
      collection: <T extends PongoDocument, Payload extends PongoDocument = T>(
        name: string,
        options?: PongoDBCollectionOptions<T, Payload>,
      ) => {
        calls.push(name);
        return base.collection<T, Payload>(name, options);
      },
    };
    const projected = projectPongoDb(
      db,
      pongoSchema.db('app', {
        collections: {
          users: pongoSchema.collection('users'),
        },
      }),
    );

    assert.ok(projected.users);
    assert.deepStrictEqual(calls, ['users']);
  });

  it('projects a database component supplied in the client definition record', () => {
    type User = PongoDocument & { email: string };
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const database = pongoSchema.db('app', {
      collections: {
        users: pongoSchema.collection<User>('users'),
      },
    });
    const client = pongoClient({
      driver,
      schema: {
        definition: pongoSchema.client({ app: database }),
      },
    });

    const app = client.app;

    assert.strictEqual(app.databaseName, 'app');
    assert.strictEqual(databaseFactoryCalls[0]?.schema?.definition, database);
    assert.deepStrictEqual(Object.keys(database.collections), ['users']);
  });

  it('does not select an unnamed database declaration for an unqualified db call', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const definition = pongoSchema.db({
      collections: {
        users: pongoSchema.collection('users'),
      },
    });
    const client = pongoClient({
      driver,
      schema: {
        definition: pongoSchema.client({ reporting: definition }),
      },
    });

    client.db();

    assert.strictEqual(databaseFactoryCalls[0]?.databaseName, 'driver-default');
    assert.strictEqual(databaseFactoryCalls[0]?.schema?.definition, undefined);
  });

  it('uses an unnamed database declaration when its projected alias is accessed', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const definition = pongoSchema.db({
      collections: {
        users: pongoSchema.collection('users'),
      },
    });
    const client = pongoClient({
      driver,
      schema: {
        definition: pongoSchema.client({ reporting: definition }),
      },
    });

    const reporting = client.reporting;

    assert.strictEqual(reporting.databaseName, 'reporting');
    assert.strictEqual(databaseFactoryCalls[0]?.schema?.definition, definition);
  });

  it('forwards connection options to the driver database factory', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const connection = { id: 'connection' };

    const client = pongoClient({
      driver,
      connectionString: 'test://connection',
      connectionOptions: {
        connection,
        transactionOptions: {
          allowNestedTransactions: false,
          useSavepoints: true,
        },
      },
    });

    client.db('custom-db');

    assert.deepStrictEqual(databaseFactoryCalls[0], {
      connectionString: 'test://connection',
      connectionOptions: {
        connection,
        transactionOptions: {
          allowNestedTransactions: false,
          useSavepoints: true,
        },
      },
      databaseName: 'custom-db',
      defaultSchemaName: 'native',
      schema: {},
      serializer: databaseFactoryCalls[0]?.serializer,
      errors: undefined,
      cache: 'disabled',
      serialization: undefined,
    });
  });

  it('reuses databases by database name', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const client = pongoClient({ driver });

    const first = client.db('same-db');
    const second = client.db('same-db');

    assert.strictEqual(first, second);
    assert.strictEqual(databaseFactoryCalls.length, 1);
  });

  it('rejects switching databases for fixed-database drivers', () => {
    const { driver } = testPongoDriver({
      supportsMultipleDatabases: false,
    });
    const client = pongoClient({ driver });

    client.db('first-db');

    assert.throws(
      () => client.db('second-db'),
      /already bound to database first-db and cannot switch to second-db/,
    );
  });

  it('connects and closes created databases', async () => {
    const { driver, connected, closed } = testPongoDriver();
    const client = pongoClient({ driver });

    client.db('first-db');
    client.db('second-db');

    await client.connect();
    await client.close();

    assert.deepStrictEqual(connected.sort(), ['first-db', 'second-db']);
    assert.deepStrictEqual(closed.sort(), ['first-db', 'second-db']);
  });

  it('rolls back active implicit sessions after withSession', async () => {
    const { driver } = testPongoDriver();
    const client = pongoClient({ driver });

    let transactionActiveDuringCallback = false;

    await client.withSession((session) => {
      session.startTransaction({
        get snapshotEnabled() {
          return false;
        },
      });
      transactionActiveDuringCallback = session.inTransaction();
      return Promise.resolve();
    });

    assert.strictEqual(transactionActiveDuringCallback, true);
  });
});
