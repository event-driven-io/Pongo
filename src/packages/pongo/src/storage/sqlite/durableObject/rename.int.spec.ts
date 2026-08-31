import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { SQL } from '@event-driven-io/dumbo';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'node:assert/strict';
import { aroundEach, describe, it } from 'vitest';
import {
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoDb,
} from '../../..';
import { cloudflareDurableObjectSQLiteDriver } from './';

type User = { _id?: string; name: string };

describe('renaming a Cloudflare Durable Object SQLite Pongo collection', () => {
  let storage: DurableObjectStorage;
  let client: PongoClient;
  let db: PongoDb;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      client = pongoClient({
        driver: cloudflareDurableObjectSQLiteDriver,
        storage,
      });
      await client.connect();
      db = client.db('database');

      try {
        await runTest();
      } finally {
        await client.close();
      }
    });
  });

  const tableNames = () =>
    storage.sql
      .exec<{ name: string }>(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name IN ('users', 'archived_users')
         ORDER BY name`,
      )
      .toArray()
      .map(({ name }) => name);

  it('runs the following operations against the renamed table', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    const renamed = await users.rename('archived_users');

    await renamed.insertOne({ name: 'Anita' });

    const documents = await renamed.find({});
    assert.deepStrictEqual(documents.map(({ name }) => name).sort(), [
      'Anita',
      'Oskar',
    ]);
  });

  it('renames a collection that was never used before', async () => {
    const users = db.collection<User>('users');

    const renamed = await users.rename('archived_users');
    await renamed.insertOne({ name: 'Oskar' });

    const documents = await renamed.find({});

    assert.deepStrictEqual(tableNames(), ['archived_users']);
    assert.deepStrictEqual(
      documents.map(({ name }) => name),
      ['Oskar'],
    );
  });

  it('renames the table in the database and leaves nothing under the old name', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    await users.rename('archived_users');

    const renamedRows = storage.sql
      .exec<{ name: string }>(
        "SELECT json_extract(data, '$.name') as name FROM archived_users",
      )
      .toArray();

    assert.deepStrictEqual(tableNames(), ['archived_users']);
    assert.deepStrictEqual(
      renamedRows.map(({ name }) => name),
      ['Oskar'],
    );
  });

  it('reports the new collection name after rename', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    const renamed = await users.rename('archived_users');

    assert.strictEqual(renamed.collectionName, 'archived_users');
    assert.strictEqual(users.collectionName, 'archived_users');
  });

  it('stops serving the renamed collection under its old name', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    await users.rename('archived_users');

    // The old create remains in the migration ledger, so declaring it again
    // skips creation and leaves no table behind.
    await assert.rejects(() => db.collection<User>('users').find({}));
  });

  it('returns the same documents when the renamed collection is looked up by its new name', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    await users.rename('archived_users');

    const documents = await db.collection<User>('archived_users').find({});
    assert.deepStrictEqual(
      documents.map(({ name }) => name),
      ['Oskar'],
    );
  });

  it('renames twice in a row', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    const archived = await users.rename('archived_users');
    const current = await archived.rename('current_users');

    await current.insertOne({ name: 'Anita' });
    const documents = await current.find({});
    assert.deepStrictEqual(documents.map(({ name }) => name).sort(), [
      'Anita',
      'Oskar',
    ]);
  });

  it('records rename as a migration', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    await users.rename('archived_users');

    const migrations = await db.sql.query<{ name: string }>(
      SQL`SELECT name FROM dmb_migrations ORDER BY id`,
    );
    assert.deepStrictEqual(
      migrations.map(({ name }) => name),
      [
        'table:pongo_collection:users:create',
        'table:pongo_collection:users:archived_users:rename',
      ],
    );
  });

  it('declares the create and the rename as migrations', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    await users.rename('archived_users');

    assert.deepStrictEqual(
      db.schema.migrations.map(({ name }) => name),
      [
        'table:pongo_collection:users:create',
        'table:pongo_collection:users:archived_users:rename',
      ],
    );
  });

  it('does not re-apply the rename on the next migrate', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    await users.rename('archived_users');
    await db.schema.migrate();
    await db.schema.migrate();

    const migrations = await db.sql.query<{ name: string }>(
      SQL`SELECT name FROM dmb_migrations ORDER BY id`,
    );
    const documents = await db.collection<User>('archived_users').find({});

    assert.deepStrictEqual(
      migrations.map(({ name }) => name),
      [
        'table:pongo_collection:users:create',
        'table:pongo_collection:users:archived_users:rename',
      ],
    );
    assert.deepStrictEqual(tableNames(), ['archived_users']);
    assert.deepStrictEqual(
      documents.map(({ name }) => name),
      ['Oskar'],
    );
  });

  it('does not apply the rename when autoMigration is None', async () => {
    const manualClient = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { autoMigration: 'None' },
    });

    try {
      const manualDb = manualClient.db('database');
      const users = manualDb.collection<User>('users');
      await manualDb.schema.migrate();
      await users.insertOne({ name: 'Oskar' });

      await users.rename('archived_users');

      assert.deepStrictEqual(tableNames(), ['users']);

      await manualDb.schema.migrate();

      assert.deepStrictEqual(tableNames(), ['archived_users']);
      assert.deepStrictEqual(
        (await users.find({})).map(({ name }) => name),
        ['Oskar'],
      );
    } finally {
      await manualClient.close();
    }
  });

  it('rolls back rename with the active session', async () => {
    const users = db.collection<User>('users');

    await assert.rejects(
      client.withSession(async (session) => {
        await session.withTransaction(async (session) => {
          await users.insertOne({ name: 'Oskar' }, { session });
          await users.rename('archived_users', { session });
          throw new Error('rollback');
        });
      }),
      /rollback/,
    );

    const tables = await db.sql.query<{ name: string }>(
      SQL`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name IN ('users', 'archived_users')
        ORDER BY name`,
    );
    assert.deepStrictEqual(tables, []);
  });

  it('renames a collection declared in a named schema and keeps the renamed handle usable', async () => {
    const users = db.collection<User>('users', { databaseSchemaName: 'crm' });
    await users.insertOne({ name: 'Oskar' });

    const renamed = await users.rename('archived_users');
    await renamed.insertOne({ name: 'Anita' });

    const documents = await renamed.find({});
    assert.deepStrictEqual(documents.map(({ name }) => name).sort(), [
      'Anita',
      'Oskar',
    ]);

    const tables = storage.sql
      .exec<{ name: string }>(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'crm.%'
         ORDER BY name`,
      )
      .toArray();
    assert.deepStrictEqual(
      tables.map(({ name }) => name),
      ['crm.archived_users'],
    );
  });

  it('resolves data after restart when the declaration uses the renamed table', async () => {
    const originalSchema = pongoSchema.client({
      database: pongoSchema.db({
        schemas: {
          crm: pongoSchema.schema('crm', {
            users: pongoSchema.collection<User>('users'),
          }),
        },
      }),
    });
    await client.close();
    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { definition: originalSchema },
    });
    const restartedDb = client.db('database');
    await restartedDb.schema.migrate();
    const users = restartedDb.collection<User>('users', {
      databaseSchemaName: 'crm',
    });
    await users.insertOne({ name: 'Oskar' });
    await users.rename('archived_users');

    const updatedSchema = pongoSchema.client({
      database: pongoSchema.db({
        schemas: {
          crm: pongoSchema.schema('crm', {
            archivedUsers: pongoSchema.collection<User>('archived_users'),
          }),
        },
      }),
    });
    await client.close();
    client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage,
      schema: { definition: updatedSchema },
    });

    const restarted = client.db('database');
    await restarted.schema.migrate();
    const archived = restarted.collection<User>('archived_users', {
      databaseSchemaName: 'crm',
    });
    const documents = await archived.find({});

    assert.deepStrictEqual(
      documents.map(({ name }) => name),
      ['Oskar'],
    );
  });
});
