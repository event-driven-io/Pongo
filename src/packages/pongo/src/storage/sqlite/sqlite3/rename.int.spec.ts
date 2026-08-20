import { SQL } from '@event-driven-io/dumbo';
import {
  SQLiteConnectionString,
  sqlite3Pool,
  type Sqlite3Pool,
} from '@event-driven-io/dumbo/sqlite3';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoDb,
} from '../../..';
import { sqlite3Driver } from './';

type User = { _id?: string; name: string };

describe('renaming a SQLite Pongo collection', () => {
  let fileName: string;
  let connectionString: SQLiteConnectionString;
  let pool: Sqlite3Pool;
  let client: PongoClient;
  let db: PongoDb;

  beforeEach(async () => {
    fileName = path.resolve('/tmp', `pongo-sqlite3-rename-${randomUUID()}.db`);
    connectionString = SQLiteConnectionString(`file:${fileName}`);
    pool = sqlite3Pool({ fileName });
    client = pongoClient({ driver: sqlite3Driver, connectionString });
    await client.connect();
    db = client.db('database');
  });

  afterEach(async () => {
    await client?.close();
    await pool.close();

    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.unlinkSync(`${fileName}${suffix}`);
      } catch {
        // ignore missing files
      }
    }
  });

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

    const tables = await pool.execute.query<{ name: string }>(
      SQL`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name IN ('users', 'archived_users')
        ORDER BY name`,
    );
    const documents = await renamed.find({});

    assert.deepStrictEqual(
      tables.rows.map(({ name }) => name),
      ['archived_users'],
    );
    assert.deepStrictEqual(
      documents.map(({ name }) => name),
      ['Oskar'],
    );
  });

  it('renames the table in the database and leaves nothing under the old name', async () => {
    const users = db.collection<User>('users');
    await users.insertOne({ name: 'Oskar' });

    await users.rename('archived_users');

    const tables = await pool.execute.query<{ name: string }>(
      SQL`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name IN ('users', 'archived_users')
        ORDER BY name`,
    );
    const renamedRows = await pool.execute.query<{ name: string }>(
      SQL`SELECT json_extract(data, '$.name') as name FROM archived_users`,
    );

    assert.deepStrictEqual(
      tables.rows.map(({ name }) => name),
      ['archived_users'],
    );
    assert.deepStrictEqual(
      renamedRows.rows.map(({ name }) => name),
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

    // the create for the old name stays recorded in the migration ledger, so
    // declaring it again skips the create and leaves no table behind.
    // MongoDB would return an empty result here, see
    // https://github.com/event-driven-io/Pongo/issues/206
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
    const tables = await pool.execute.query<{ name: string }>(
      SQL`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name IN ('users', 'archived_users')
        ORDER BY name`,
    );
    const documents = await db.collection<User>('archived_users').find({});

    assert.deepStrictEqual(
      migrations.map(({ name }) => name),
      [
        'table:pongo_collection:users:create',
        'table:pongo_collection:users:archived_users:rename',
      ],
    );
    assert.deepStrictEqual(
      tables.rows.map(({ name }) => name),
      ['archived_users'],
    );
    assert.deepStrictEqual(
      documents.map(({ name }) => name),
      ['Oskar'],
    );
  });

  it('does not apply the rename when autoMigration is None', async () => {
    const manualClient = pongoClient({
      driver: sqlite3Driver,
      connectionString,
      schema: { autoMigration: 'None' },
    });
    const tableNames = async () => {
      const tables = await pool.execute.query<{ name: string }>(
        SQL`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name IN ('users', 'archived_users')
          ORDER BY name`,
      );
      return tables.rows.map(({ name }) => name);
    };

    try {
      const manualDb = manualClient.db('database');
      const users = manualDb.collection<User>('users');
      await manualDb.schema.migrate();
      await users.insertOne({ name: 'Oskar' });

      await users.rename('archived_users');

      assert.deepStrictEqual(await tableNames(), ['users']);

      await manualDb.schema.migrate();

      assert.deepStrictEqual(await tableNames(), ['archived_users']);
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

    const tables = await pool.execute.query<{ name: string }>(
      SQL`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'crm.%'
        ORDER BY name`,
    );
    assert.deepStrictEqual(
      tables.rows.map(({ name }) => name),
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
      driver: sqlite3Driver,
      connectionString,
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
      driver: sqlite3Driver,
      connectionString,
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
