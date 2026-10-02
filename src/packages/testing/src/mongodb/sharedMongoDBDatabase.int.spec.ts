import assert from 'assert';
import { MongoClient } from 'mongodb';
import { describe, inject, it } from 'vitest';
import { sharedMongoDBDatabase } from './sharedMongoDBDatabase';

const databaseNames = async (): Promise<string[]> => {
  const client = new MongoClient(inject('sharedMongoDBConnectionString'), {
    directConnection: true,
  });
  await client.connect();

  try {
    const { databases } = await client.db().admin().listDatabases();
    return databases.map(({ name }) => name);
  } finally {
    await client.close();
  }
};

describe('sharedMongoDBDatabase', () => {
  it('connects to its own database', async () => {
    const database = sharedMongoDBDatabase();
    const client = new MongoClient(database.connectionString, {
      directConnection: true,
    });
    await client.connect();

    try {
      assert.equal(client.db().databaseName, database.databaseName);
    } finally {
      await client.close();
      await database.close();
    }
  });

  it('gives each caller a different database', async () => {
    const first = sharedMongoDBDatabase();
    const second = sharedMongoDBDatabase();

    try {
      assert.notEqual(first.databaseName, second.databaseName);
    } finally {
      await first.close();
      await second.close();
    }
  });

  it('drops its database on close', async () => {
    const database = sharedMongoDBDatabase();
    const client = new MongoClient(database.connectionString, {
      directConnection: true,
    });
    await client.connect();

    try {
      await client.db().collection('documents').insertOne({ value: 1 });
    } finally {
      await client.close();
    }

    await database.close();

    assert.equal(
      (await databaseNames()).includes(database.databaseName),
      false,
    );
  });
});
