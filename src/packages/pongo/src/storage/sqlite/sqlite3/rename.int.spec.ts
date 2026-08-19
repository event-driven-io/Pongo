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
});
