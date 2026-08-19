import { SQL } from '@event-driven-io/dumbo';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { pongoClient, type PongoClient, type PongoDb } from '../../..';
import { sqlite3Driver } from './';

type User = { _id?: string; name: string };

const memoryConnectionString = () =>
  `file::memory:?cache=shared&_${Math.random()}`;

describe('renaming a Pongo collection', () => {
  let client: PongoClient;
  let db: PongoDb;

  beforeEach(async () => {
    client = pongoClient({
      driver: sqlite3Driver,
      connectionString: memoryConnectionString(),
    });
    await client.connect();
    db = client.db('db');
  });

  afterEach(async () => {
    await client.close();
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

    const documents = await db.collection<User>('users').find({});
    assert.deepStrictEqual(documents, []);
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
      ['table:users:archived_users:rename'],
    );
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
});
