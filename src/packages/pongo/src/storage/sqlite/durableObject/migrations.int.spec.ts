import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { dumboSchema, SQL, type TableRowType } from '@event-driven-io/dumbo';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'node:assert/strict';
import { aroundEach, describe, expectTypeOf, it } from 'vitest';
import {
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoCollection,
} from '../../../core';
import { cloudflareDurableObjectSQLiteDriver } from '.';

type User = {
  email: string;
};

describe('Cloudflare Durable Object SQLite migration integration', () => {
  let storage: DurableObjectStorage;
  let client: PongoClient | undefined;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      try {
        await runTest();
      } finally {
        await client?.close();
      }
    });
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

  const declaredTables = () =>
    storage.sql
      .exec<{ name: string }>(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name IN ('crm.users', 'hr.roles')
         ORDER BY name`,
      )
      .toArray()
      .map(({ name }) => name);

  it('migrates the whole database through a collection schema', async () => {
    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { definition: twoSchemaDefinition() },
    });
    const db = client.db('database');

    await db
      .collection<User>('users', { databaseSchemaName: 'crm' })
      .schema.migrate();

    assert.deepStrictEqual(declaredTables(), ['crm.users', 'hr.roles']);
  });

  it('rolls back a collection schema migrate with the active session', async () => {
    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { definition: twoSchemaDefinition() },
    });
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

    assert.deepStrictEqual(declaredTables(), []);
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
    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { definition: schema },
    });
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

    const objects = storage.sql
      .exec<{ name: string; type: string }>(
        `SELECT name, type
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
      )
      .toArray();
    const migrationNames = storage.sql
      .exec<{ name: string }>('SELECT name FROM dmb_migrations ORDER BY id')
      .toArray();
    const defaultCount = storage.sql
      .exec<{ count: number }>('SELECT COUNT(*) as count FROM users')
      .toArray();
    const crmCount = storage.sql
      .exec<{ count: number }>('SELECT COUNT(*) as count FROM "crm.users"')
      .toArray();
    const auditCount = storage.sql
      .exec<{ count: number }>('SELECT COUNT(*) as count FROM "audit.users"')
      .toArray();
    const lateCount = storage.sql
      .exec<{ count: number }>(
        'SELECT COUNT(*) as count FROM "readmodels.late_users"',
      )
      .toArray();

    assert.deepStrictEqual(objects, [
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
      migrationNames.map((row) => row.name),
      [
        ...expectedAppliedNames,
        'table:pongo_collection:readmodels:late_users:create',
      ],
    );
    assert.strictEqual(defaultCount[0]?.count, 1);
    assert.strictEqual(crmCount[0]?.count, 1);
    assert.strictEqual(auditCount[0]?.count, 0);
    assert.strictEqual(lateCount[0]?.count, 1);
  });

  it('records migrations in the configured migration table', async () => {
    const schema = pongoSchema.client({
      database: pongoSchema.db({
        collections: {
          users: pongoSchema.collection<User>('users'),
        },
      }),
    });
    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { definition: schema },
      migrationTable: { tableName: 'client_migrations' },
    });
    const db = client.db('database');

    await db.schema.migrate();
    await db.schema.migrate({
      migrationTable: { tableName: 'call_migrations' },
    });

    const clientLedger = storage.sql
      .exec<{ name: string }>('SELECT name FROM client_migrations ORDER BY id')
      .toArray();
    const callLedger = storage.sql
      .exec<{ name: string }>('SELECT name FROM call_migrations ORDER BY id')
      .toArray();
    const defaultLedger = storage.sql
      .exec<{ count: number }>(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE name = 'dmb_migrations'",
      )
      .toArray();

    assert.deepStrictEqual(
      clientLedger.map((row) => row.name),
      ['table:pongo_collection:users:create'],
    );
    assert.deepStrictEqual(
      callLedger.map((row) => row.name),
      ['table:pongo_collection:users:create'],
    );
    assert.strictEqual(defaultLedger[0]?.count, 0);
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
    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
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
    const objects = storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('messages', 'readmodels.users') ORDER BY name",
      )
      .toArray();
    const migrationNames = storage.sql
      .exec<{ name: string }>('SELECT name FROM dmb_migrations ORDER BY id')
      .toArray();

    assert.deepStrictEqual(
      objects.map(({ name }) => name),
      ['messages', 'readmodels.users'],
    );
    assert.strictEqual(stored?.email, 'user@example.com');
    assert.deepStrictEqual(
      migrationNames.map(({ name }) => name),
      [
        'table:event_store:messages:create',
        'table:pongo_collection:readmodels:users:create',
      ],
    );
  });
});
