import assert from 'assert';
import pg from 'pg';
import { describe, inject, it } from 'vitest';
import { sharedPostgreSQLDatabase } from './sharedPostgreSQLDatabase';

const databaseExists = async (databaseName: string): Promise<boolean> => {
  const client = new pg.Client({
    connectionString: inject('sharedPostgreSQLConnectionString'),
  });
  await client.connect();

  try {
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName],
    );
    return result.rowCount === 1;
  } finally {
    await client.end();
  }
};

const currentDatabase = async (connectionString: string): Promise<string> => {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query<{ name: string }>(
      'SELECT current_database() AS name',
    );
    return result.rows[0]!.name;
  } finally {
    await client.end();
  }
};

describe('sharedPostgreSQLDatabase', () => {
  it('connects to its own database', async () => {
    const database = await sharedPostgreSQLDatabase();

    try {
      assert.equal(
        await currentDatabase(database.connectionString),
        database.databaseName,
      );
    } finally {
      await database.close();
    }
  });

  it('gives each caller a different database', async () => {
    const first = await sharedPostgreSQLDatabase();
    const second = await sharedPostgreSQLDatabase();

    try {
      assert.notEqual(first.databaseName, second.databaseName);
    } finally {
      await first.close();
      await second.close();
    }
  });

  it('drops its database on close', async () => {
    const database = await sharedPostgreSQLDatabase();

    await database.close();

    assert.equal(await databaseExists(database.databaseName), false);
  });

  it('refuses to drop a database that still has open connections', async () => {
    const database = await sharedPostgreSQLDatabase();
    const leaked = new pg.Client({
      connectionString: database.connectionString,
    });
    await leaked.connect();

    try {
      await assert.rejects(database.close(), /being accessed by other users/);
    } finally {
      await leaked.end();
      await database.close();
    }
  });
});
