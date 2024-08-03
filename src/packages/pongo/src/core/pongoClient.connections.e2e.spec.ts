import { isNodePostgresNativePool } from '@event-driven-io/dumbo';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { pongoClient } from './pongoClient';

type User = {
  _id?: string;
  name: string;
};

void describe('Pongo collection', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    connectionString = postgres.getConnectionUri();
  });

  after(async () => {
    await postgres.stop();
  });

  const insertDocumentUsingPongo = async (
    poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
  ) => {
    const pongo = pongoClient(
      connectionString,
      isNodePostgresNativePool(poolOrClient)
        ? undefined
        : {
            client: poolOrClient,
          },
    );

    try {
      const pongoCollection = pongo.db().collection<User>('connections');
      await pongoCollection.insertOne({ name: randomUUID() });
    } finally {
      await pongo.close();
    }
  };

  void describe('Pool', () => {
    void it('connects using pool', async () => {
      const pool = new pg.Pool({ connectionString });

      try {
        await insertDocumentUsingPongo(pool);
      } catch (error) {
        console.log(error);
      } finally {
        await pool.end();
      }
    });

    void it('connects using connected pool client', async () => {
      const pool = new pg.Pool({ connectionString });
      const poolClient = await pool.connect();

      try {
        await insertDocumentUsingPongo(poolClient);
      } finally {
        poolClient.release();
        await pool.end();
      }
    });

    void it('connects using connected client', async () => {
      const client = new pg.Client({ connectionString });
      await client.connect();

      try {
        await insertDocumentUsingPongo(client);
      } finally {
        await client.end();
      }
    });
  });
});