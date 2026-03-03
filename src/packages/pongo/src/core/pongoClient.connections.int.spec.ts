import { dumbo } from '@event-driven-io/dumbo';
import {
  isPgNativePool,
  PostgreSQLConnectionString,
  type PgConnection,
} from '@event-driven-io/dumbo/pg';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, it } from 'vitest';
import pg from 'pg';
import { pongoDriver } from '../pg';
import { pongoClient } from './pongoClient';

type User = {
  _id?: string;
  name: string;
};

describe('Pongo collection', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: PostgreSQLConnectionString;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = PostgreSQLConnectionString(postgres.getConnectionUri());
  });

  afterAll(async () => {
    await postgres.stop();
  });

  const insertDocumentUsingPongo = async (
    poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
  ) => {
    const pongo = pongoClient({
      driver: pongoDriver,
      connectionString,
      connectionOptions: isPgNativePool(poolOrClient)
        ? undefined
        : {
            client: poolOrClient,
          },
    });

    try {
      const pongoCollection = pongo.db().collection<User>('connections');
      await pongoCollection.insertOne({ name: randomUUID() });
    } finally {
      await pongo.close();
    }
  };

  describe('Pool', () => {
    it('connects using pool', async () => {
      const pool = new pg.Pool({ connectionString });

      try {
        await insertDocumentUsingPongo(pool);
      } catch (error) {
        console.log(error);
      } finally {
        await pool.end();
      }
    });

    it('connects using connected pool client', async () => {
      const pool = new pg.Pool({ connectionString });
      const poolClient = await pool.connect();

      try {
        await insertDocumentUsingPongo(poolClient);
      } finally {
        poolClient.release();
        await pool.end();
      }
    });

    it('connects using connected client', async () => {
      const client = new pg.Client({ connectionString });
      await client.connect();

      try {
        await insertDocumentUsingPongo(client);
      } finally {
        await client.end();
      }
    });

    it('connects using existing connection', async () => {
      const pool = dumbo({ connectionString });

      try {
        await pool.withConnection(async (connection) => {
          const pongo = pongoClient({
            driver: pongoDriver,
            connectionString,
            connectionOptions: {
              connection,
              pooled: false,
            },
          });

          const users = pongo.db().collection<User>('connections');
          await users.insertOne({ name: randomUUID() });
          await users.insertOne({ name: randomUUID() });
        });
      } finally {
        await pool.close();
      }
    });

    it('connects using existing connection from transaction', async () => {
      const pool = dumbo({ connectionString });

      try {
        await pool.withTransaction(async ({ connection }) => {
          const pongo = pongoClient({
            driver: pongoDriver,
            connectionString,
            connectionOptions: { connection: connection as PgConnection },
          });

          const users = pongo.db().collection<User>('connections');
          await users.insertOne({ name: randomUUID() });
          await users.insertOne({ name: randomUUID() });
        });
      } finally {
        await pool.close();
      }
    });
  });
});
