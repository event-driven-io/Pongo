import { dumboSchema, SQL, type TableRowType } from '@event-driven-io/dumbo';
import {
  SQLiteConnectionString,
  sqlite3Pool,
} from '@event-driven-io/dumbo/sqlite3';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expectTypeOf, it } from 'vitest';
import {
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoCollection,
} from '../../../core';
import { sqlite3Driver } from '.';

type User = {
  email: string;
};

describe('SQLite3 migration integration', () => {
  const fileName = path.resolve(
    '/tmp',
    `pongo-sqlite3-migrations-${randomUUID()}.db`,
  );
  const connectionString = SQLiteConnectionString(`file:${fileName}`);

  afterEach(() => {
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.unlinkSync(`${fileName}${suffix}`);
      } catch {
        // ignore missing files
      }
    }
  });

  const twoSchemaDefinition = () =>
    pongoSchema.client({
      database: pongoSchema.db({
        schemas: {
          crm: pongoSchema.schema('crm', {
            users: pongoSchema.collection<User>('users'),
          }),
          hr: pongoSchema.schema('hr', {
            roles: pongoSchema.collection<User>('roles'),
          }),
        },
      }),
    });

  const declaredTables = (pool: ReturnType<typeof sqlite3Pool>) =>
    pool.execute
      .query<{ name: string }>(
        SQL`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name IN ('crm.users', 'hr.roles')
          ORDER BY name`,
      )
      .then((tables) => tables.rows.map(({ name }) => name));

  it('migrates the whole database through a collection schema', async () => {
    const client = pongoClient({
      driver: sqlite3Driver,
      connectionString,
      schema: { definition: twoSchemaDefinition() },
    });
    const pool = sqlite3Pool({ fileName });

    try {
      const db = client.db('database');

      await db
        .collection<User>('users', { databaseSchemaName: 'crm' })
        .schema.migrate();

      assert.deepStrictEqual(await declaredTables(pool), [
        'crm.users',
        'hr.roles',
      ]);
    } finally {
      await client.close();
      await pool.close();
    }
  });

  it('rolls back a collection schema migrate with the active session', async () => {
    const client: PongoClient = pongoClient({
      driver: sqlite3Driver,
      connectionString,
      schema: { definition: twoSchemaDefinition() },
    });
    const pool = sqlite3Pool({ fileName });

    try {
      const db = client.db('database');
      const users = db.collection<User>('users', {
        databaseSchemaName: 'crm',
      });

      await assert.rejects(
        client.withSession(async (session) => {
          await session.withTransaction(async (session) => {
            await users.schema.migrate({ session });
            throw new Error('rollback');
          });
        }),
        /rollback/,
      );

      assert.deepStrictEqual(await declaredTables(pool), []);
    } finally {
      await client.close();
      await pool.close();
    }
  });

  it('applies default and schema-prefixed collection migrations in order', async () => {
    const schema = pongoSchema.client({
      database: pongoSchema
        .db({
          collections: {
            users: pongoSchema.collection('users'),
            explicitDefaultUsers: pongoSchema.collection(
              'explicit_default_users',
              {
                indexes: {
                  email: pongoSchema.index(
                    'explicit_default_email_idx',
                    'email',
                  ),
                },
              },
            ),
          },
        })
        .withSchema({
          crm: pongoSchema.schema('crm', {
            crmUsers: pongoSchema.collection('users', {
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
                    SQL`CREATE INDEX IF NOT EXISTS ${indexReference} ON ${tableReference} (data)`,
                ),
              },
            }),
          }),
          audit: pongoSchema.schema('audit', {
            auditUsers: pongoSchema.collection('users', {
              indexes: {
                email: pongoSchema.index('audit_users_email_idx', 'email'),
              },
            }),
          }),
        }),
    });
    const client = pongoClient({
      driver: sqlite3Driver,
      connectionString,
      schema: { definition: schema },
    });
    const pool = sqlite3Pool({ fileName });
    const expectedMigrationNames = [
      'table:pongo_collection:users:create',
      'table:pongo_collection:explicit_default_users:create',
      'index:pongo_index:explicit_default_users:explicit_default_email_idx:create',
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
    const expectedAppliedNames = expectedMigrationNames.filter(
      (name) => !name.startsWith('schema:'),
    );

    try {
      const db = client.db('database');
      assert.deepStrictEqual(
        db.schema.migrations.map((migration) => migration.name),
        expectedMigrationNames,
      );
      await db.schema.migrate();
      await db.schema.migrate();

      await db
        .collection('users')
        .insertOne({ _id: 'default-user', email: 'default@test' });
      await db
        .collection('users', { databaseSchemaName: 'crm' })
        .insertOne({ _id: 'crm-user', email: 'crm@test' });
      const lateUsers = db.collection('late_users', {
        databaseSchemaName: 'readmodels',
      });
      await db.schema.migrate();
      await db.schema.migrate();
      await lateUsers.insertOne({ _id: 'late-user', email: 'late@test' });

      const objects = await pool.execute.query<{ name: string; type: string }>(
        SQL`
          SELECT name, type
          FROM sqlite_master
          WHERE name IN (
            'users',
            'explicit_default_users',
            'crm.users',
            'audit.users',
            'explicit_default_email_idx',
            'crm.users_email_idx',
            'crm.users_external_id_uq',
            'crm.users_data_idx',
            'crm.users_custom_data_idx',
            'audit.audit_users_email_idx',
            'readmodels.late_users'
          )
          ORDER BY type, name`,
      );
      const migrationNames = await pool.execute.query<{ name: string }>(
        SQL`SELECT name FROM dmb_migrations ORDER BY id`,
      );
      const defaultCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM users`,
      );
      const crmCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM ${SQL.identifier('crm.users')}`,
      );
      const auditCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM ${SQL.identifier('audit.users')}`,
      );
      const lateCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM ${SQL.identifier('readmodels.late_users')}`,
      );

      assert.deepStrictEqual(objects.rows, [
        { name: 'audit.audit_users_email_idx', type: 'index' },
        { name: 'crm.users_custom_data_idx', type: 'index' },
        { name: 'crm.users_data_idx', type: 'index' },
        { name: 'crm.users_email_idx', type: 'index' },
        { name: 'crm.users_external_id_uq', type: 'index' },
        { name: 'explicit_default_email_idx', type: 'index' },
        { name: 'audit.users', type: 'table' },
        { name: 'crm.users', type: 'table' },
        { name: 'explicit_default_users', type: 'table' },
        { name: 'readmodels.late_users', type: 'table' },
        { name: 'users', type: 'table' },
      ]);
      assert.deepStrictEqual(
        migrationNames.rows.map((row) => row.name),
        [
          ...expectedAppliedNames,
          'table:pongo_collection:readmodels:late_users:create',
        ],
      );
      assert.strictEqual(defaultCount.rows[0]?.count, 1);
      assert.strictEqual(crmCount.rows[0]?.count, 1);
      assert.strictEqual(auditCount.rows[0]?.count, 0);
      assert.strictEqual(lateCount.rows[0]?.count, 1);
    } finally {
      await client.close();
      await pool.close();
    }
  });

  it('records migrations in the configured migration table', async () => {
    const schema = pongoSchema.client({
      database: pongoSchema.db({
        collections: {
          users: pongoSchema.collection<User>('users'),
        },
      }),
    });
    const client = pongoClient({
      driver: sqlite3Driver,
      connectionString,
      schema: { definition: schema },
      migrationTable: { tableName: 'client_migrations' },
    });
    const pool = sqlite3Pool({ fileName });

    try {
      const db = client.db('database');
      await db.schema.migrate();
      await db.schema.migrate({
        migrationTable: { tableName: 'call_migrations' },
      });

      const clientLedger = await pool.execute.query<{ name: string }>(
        SQL`SELECT name FROM client_migrations ORDER BY id`,
      );
      const callLedger = await pool.execute.query<{ name: string }>(
        SQL`SELECT name FROM call_migrations ORDER BY id`,
      );
      const defaultLedger = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM sqlite_master WHERE name = 'dmb_migrations'`,
      );

      assert.deepStrictEqual(
        clientLedger.rows.map((row) => row.name),
        ['table:pongo_collection:users:create'],
      );
      assert.deepStrictEqual(
        callLedger.rows.map((row) => row.name),
        ['table:pongo_collection:users:create'],
      );
      assert.strictEqual(defaultLedger.rows[0]?.count, 0);
    } finally {
      await client.close();
      await pool.close();
    }
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
    const client = pongoClient({
      driver: sqlite3Driver,
      connectionString,
      schema: {
        definition: pongoSchema.client({ database: definition }),
      },
    });
    const pool = sqlite3Pool({ fileName });

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
      const db = client.db('database');
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
      const objects = await pool.execute.query<{ name: string }>(
        SQL`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('messages', 'readmodels.users') ORDER BY name`,
      );
      const migrationNames = await pool.execute.query<{ name: string }>(
        SQL`SELECT name FROM dmb_migrations ORDER BY id`,
      );

      assert.deepStrictEqual(
        objects.rows.map(({ name }) => name),
        ['messages', 'readmodels.users'],
      );
      assert.strictEqual(stored?.email, 'user@example.com');
      assert.deepStrictEqual(
        migrationNames.rows.map(({ name }) => name),
        [
          'table:event_store:messages:create',
          'table:pongo_collection:readmodels:users:create',
        ],
      );
    } finally {
      await client.close();
      await pool.close();
    }
  });
});
