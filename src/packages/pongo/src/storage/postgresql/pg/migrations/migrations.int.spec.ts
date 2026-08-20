import {
  dumbo,
  dumboSchema,
  SQL,
  type Dumbo,
  type TableRowType,
} from '@event-driven-io/dumbo';
import {
  PostgreSQLConnectionString,
  tableExists,
} from '@event-driven-io/dumbo/pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import assert from 'assert';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expectTypeOf,
  it,
} from 'vitest';
import { pongoDriver } from '..';
import {
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoCollection,
} from '../../../../core';

type User = {
  email: string;
};

describe('Migration Integration Tests', () => {
  let pool: Dumbo;
  let postgres: StartedPostgreSqlContainer;
  let connectionString: PostgreSQLConnectionString;
  let client: PongoClient;

  const crmUsers = pongoSchema.collection('users', {
    indexes: {
      email: pongoSchema.index('users_email_idx', 'email'),
      externalId: pongoSchema.index.unique('users_external_id_uq', [
        'external',
        'id',
      ]),
      document: pongoSchema.index.json('users_data_idx'),
      custom: pongoSchema.index.custom(
        'users_custom_data_idx',
        ({ tableReference, indexReference }) =>
          SQL`CREATE INDEX IF NOT EXISTS ${indexReference} ON ${tableReference} USING GIN (data jsonb_path_ops)`,
      ),
    },
  });

  const schema = pongoSchema.client({
    database: pongoSchema.db({
      schemas: {
        public: pongoSchema.schema('public', {
          users: pongoSchema.collection('users'),
          explicitDefaultUsers: pongoSchema.collection(
            'explicit_default_users',
            {
              indexes: {
                email: pongoSchema.index('explicit_default_email_idx', 'email'),
              },
            },
          ),
          roles: pongoSchema.collection('roles'),
        }),
        crm: pongoSchema.schema('crm', { crmUsers }),
        audit: pongoSchema.schema('audit', {
          auditUsers: pongoSchema.collection('users', {
            indexes: {
              email: pongoSchema.index('audit_users_email_idx', 'email'),
            },
          }),
        }),
      },
    }),
  });

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = PostgreSQLConnectionString(postgres.getConnectionUri());
    pool = dumbo({ connectionString });
    client = pongoClient({
      driver: pongoDriver,
      connectionString,
      defaultSchemaName: 'public',
      schema: { autoMigration: 'CreateOrUpdate', definition: schema },
    });
  });

  afterAll(async () => {
    await client.close();
    await pool.close();
    await postgres.stop();
  });

  beforeEach(async () => {
    await pool.execute.query(
      SQL`DROP SCHEMA IF EXISTS audit CASCADE; DROP SCHEMA IF EXISTS crm CASCADE; DROP SCHEMA IF EXISTS readmodels CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;`,
    );
  });

  it('migrates the whole database through a collection schema', async () => {
    const db = client.db('database');

    await db
      .collection<User>('users', { databaseSchemaName: 'crm' })
      .schema.migrate();

    const crmUsersTableExists = await pool.execute.query<{ exists: boolean }>(
      SQL`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'crm' AND table_name = 'users'
        )`,
    );

    assert.strictEqual(crmUsersTableExists.rows[0]?.exists, true);
    assert.strictEqual(await tableExists(pool.execute, 'roles'), true);
  });

  it('rolls back a collection schema migrate with the active session', async () => {
    const db = client.db('database');
    const users = db.collection<User>('users', { databaseSchemaName: 'crm' });

    await assert.rejects(
      client.withSession(async (session) => {
        await session.withTransaction(async (session) => {
          await users.schema.migrate({ session });
          throw new Error('rollback');
        });
      }),
      /rollback/,
    );

    const crmSchemaExists = await pool.execute.query<{ exists: boolean }>(
      SQL`
        SELECT EXISTS (
          SELECT FROM information_schema.schemata WHERE schema_name = 'crm'
        )`,
    );

    assert.strictEqual(crmSchemaExists.rows[0]?.exists, false);
    assert.strictEqual(await tableExists(pool.execute, 'roles'), false);
  });

  it('creates declared tables and indexes in default and named schemas', async () => {
    const db = client.db('database');
    await db.schema.migrate();

    const usersTableExists = await tableExists(pool.execute, 'users');
    const rolesTableExists = await tableExists(pool.execute, 'roles');
    const explicitDefaultUsersTableExists = await tableExists(
      pool.execute,
      'explicit_default_users',
    );
    const crmUsersTableExists = await pool.execute.query<{ exists: boolean }>(
      SQL`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'crm' AND table_name = 'users'
        )`,
    );
    const auditUsersTableExists = await pool.execute.query<{ exists: boolean }>(
      SQL`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'audit' AND table_name = 'users'
        )`,
    );
    const indexNames = await pool.execute.query<{ indexname: string }>(
      SQL`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname IN ('public', 'crm', 'audit')
          AND indexname IN (
            'explicit_default_email_idx',
            'users_email_idx',
            'users_external_id_uq',
            'users_data_idx',
            'users_custom_data_idx',
            'audit_users_email_idx'
          )
        ORDER BY indexname`,
    );

    assert.ok(usersTableExists, 'The users table should exist.');
    assert.ok(rolesTableExists, 'The roles table should exist.');
    assert.ok(
      explicitDefaultUsersTableExists,
      'The explicit default schema table should exist.',
    );
    assert.strictEqual(
      crmUsersTableExists.rows[0]?.exists,
      true,
      'The crm.users table should exist.',
    );
    assert.strictEqual(
      auditUsersTableExists.rows[0]?.exists,
      true,
      'The audit.users table should exist.',
    );
    assert.deepStrictEqual(
      indexNames.rows.map((row) => row.indexname),
      [
        'audit_users_email_idx',
        'explicit_default_email_idx',
        'users_custom_data_idx',
        'users_data_idx',
        'users_email_idx',
        'users_external_id_uq',
      ],
    );
  });

  it('uses default and explicit schemas in runtime collection calls', async () => {
    const db = client.db('database');
    await db.schema.migrate();

    const defaultUsers = db.collection('users');
    const crmUsers = db.collection('users', {
      databaseSchemaName: 'crm',
    });

    await defaultUsers.insertOne({ _id: 'public-user', email: 'public@test' });
    await crmUsers.insertOne({ _id: 'crm-user', email: 'crm@test' });

    const defaultCount = await pool.execute.query<{ count: number }>(
      SQL`SELECT COUNT(*)::int as count FROM public.users`,
    );
    const crmCount = await pool.execute.query<{ count: number }>(
      SQL`SELECT COUNT(*)::int as count FROM crm.users`,
    );
    const auditCount = await pool.execute.query<{ count: number }>(
      SQL`SELECT COUNT(*)::int as count FROM audit.users`,
    );

    assert.strictEqual(defaultCount.rows[0]?.count, 1);
    assert.strictEqual(crmCount.rows[0]?.count, 1);
    assert.strictEqual(auditCount.rows[0]?.count, 0);
  });

  it('applies each schema, table, and index migration only once', async () => {
    const db = client.db('database');
    const expectedMigrationNames = [
      'schema:public:create',
      'table:pongo_collection:public:users:create',
      'table:pongo_collection:public:explicit_default_users:create',
      'index:pongo_index:public:explicit_default_users:explicit_default_email_idx:create',
      'table:pongo_collection:public:roles:create',
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
      'index:pongo_index:crm:users:users_email_idx:create',
      'index:pongo_index:crm:users:users_external_id_uq:create',
      'index:pongo_index:crm:users:users_data_idx:create',
      'index:pongo_index:crm:users:users_custom_data_idx:create',
      'schema:audit:create',
      'table:pongo_collection:audit:users:create',
      'index:pongo_index:audit:users:audit_users_email_idx:create',
    ];
    const expectedAppliedNames = expectedMigrationNames;

    assert.deepStrictEqual(
      db.schema.migrations.map((migration) => migration.name),
      expectedMigrationNames,
    );
    await db.schema.migrate();
    await db.schema.migrate();

    const migrationNames = await pool.execute.query<{ name: string }>(
      SQL`SELECT name FROM dmb_migrations ORDER BY id`,
    );
    assert.deepStrictEqual(
      migrationNames.rows.map((r) => r.name),
      expectedAppliedNames,
    );
    assert.strictEqual(
      migrationNames.rowCount,
      expectedAppliedNames.length,
      'The migration should only be applied once.',
    );
  });

  it('migrates mixed event-store and Pongo extension schemas', async () => {
    const users = pongoSchema.collection<User>('users');
    const eventStore = dumboSchema.extension('event-store', {
      tables: {
        messages: dumboSchema.table('messages', {
          kind: 'event_store',
          columns: {
            id: dumboSchema.column('id', SQL.column.type.Text, {
              primaryKey: true,
            }),
          },
        }),
      },
    });
    const eventStoreReadModels = dumboSchema.extension(
      'event-store-readmodels',
      { schemas: { readmodels: dumboSchema.schema('readmodels', { users }) } },
    );
    const definition = pongoSchema.db(
      { schemas: {} },
      { eventStore, eventStoreReadModels },
    );
    const extensionClient = pongoClient({
      driver: pongoDriver,
      connectionString,
      schema: {
        definition: pongoSchema.client({ database: definition }),
      },
    });

    expectTypeOf(
      eventStoreReadModels.schemas.readmodels.tables.users,
    ).toEqualTypeOf(users);
    expectTypeOf<
      TableRowType<
        typeof eventStoreReadModels.schemas.readmodels.tables.users
      >['data']
    >().toEqualTypeOf<User>();
    expectTypeOf(
      definition.extensions.eventStoreReadModels.schemas.readmodels.tables
        .users,
    ).toEqualTypeOf(users);

    try {
      const db = extensionClient.db('database');
      const usersCollection = db.collection<User>('users', {
        databaseSchemaName: 'readmodels',
      });
      expectTypeOf(usersCollection).toEqualTypeOf<PongoCollection<User>>();

      assert.strictEqual(
        usersCollection.schema.component,
        eventStoreReadModels.schemas.readmodels.tables.users,
      );
      assert.deepStrictEqual(
        db.schema.migrations.map(({ name }) => name),
        [
          'table:event_store:messages:create',
          'schema:readmodels:create',
          'table:pongo_collection:readmodels:users:create',
        ],
      );

      await db.schema.migrate();
      await db.schema.migrate();
      await usersCollection.insertOne({
        _id: 'user-1',
        email: 'user@example.com',
      });

      const stored = await usersCollection.findOne({ _id: 'user-1' });
      const migrationNames = await pool.execute.query<{ name: string }>(
        SQL`SELECT name FROM dmb_migrations ORDER BY id`,
      );

      assert.ok(await tableExists(pool.execute, 'messages'));
      assert.strictEqual(stored?.email, 'user@example.com');
      assert.deepStrictEqual(
        migrationNames.rows.map(({ name }) => name),
        [
          'table:event_store:messages:create',
          'schema:readmodels:create',
          'table:pongo_collection:readmodels:users:create',
        ],
      );
    } finally {
      await extensionClient.close();
    }
  });
});
