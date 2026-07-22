import { dumbo, SQL } from '@event-driven-io/dumbo';
import {
  isPgNativePool,
  PostgreSQLConnectionString,
  type PgConnection,
} from '@event-driven-io/dumbo/pg';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { pongoClient } from '../../..';
import { pongoDriver } from '../../../pg';

type User = {
  _id?: string;
  name: string;
};

const isNestedTransactionsDisabledError = (error: unknown): boolean =>
  error instanceof Error &&
  'errorType' in error &&
  error.errorType === 'InvalidOperationError' &&
  error.message.includes('allowNestedTransactions');

describe('Pongo PostgreSQL connections', () => {
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

  it('connects using pool', async () => {
    const pool = new pg.Pool({ connectionString });

    try {
      await insertDocumentUsingPongo(pool);
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

  it('reuses the connection passed through connectionOptions', async () => {
    const pool = dumbo({ connectionString });

    try {
      await pool.withConnection(async (connection) => {
        const collectionName = `connections_${randomUUID().replaceAll('-', '')}`;

        const pongo = pongoClient({
          driver: pongoDriver,
          connectionString,
          connectionOptions: {
            connection,
            pooled: false,
          },
        });

        const users = pongo.db().collection<User>(collectionName);
        await users.insertOne({ name: randomUUID() });
        await users.insertOne({ name: randomUUID() });

        const count = await users.countDocuments({});
        assert.strictEqual(Number(count), 2);
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

  it('runs nested Pongo transaction on existing Dumbo connection without nested transaction options', async () => {
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

        const db = pongo.db();

        await db.withTransaction((outer) =>
          outer.withTransaction((inner) => inner.execute.query(SQL`SELECT 1`)),
        );
      });
    } finally {
      await pool.close();
    }
  });

  it('respects explicitly disabled nested transactions on existing Dumbo connection', async () => {
    const pool = dumbo({ connectionString });

    try {
      await pool.withConnection(async (connection) => {
        const pongo = pongoClient({
          driver: pongoDriver,
          connectionString,
          connectionOptions: {
            connection,
            pooled: false,
            transactionOptions: { allowNestedTransactions: false },
          },
        });

        const db = pongo.db();

        await assert.rejects(
          () =>
            db.withTransaction((outer) =>
              outer.withTransaction((inner) =>
                inner.execute.query(SQL`SELECT 1`),
              ),
            ),
          isNestedTransactionsDisabledError,
        );
      });
    } finally {
      await pool.close();
    }
  });

  it('threads savepoint option on existing Dumbo connection', async () => {
    const pool = dumbo({ connectionString });

    try {
      await pool.withConnection(async (connection) => {
        const tableName = `savepoints_${randomUUID().replaceAll('-', '')}`;
        await connection.execute.command(
          SQL`CREATE TABLE ${SQL.identifier(tableName)} (id INTEGER NOT NULL)`,
        );

        const pongo = pongoClient({
          driver: pongoDriver,
          connectionString,
          connectionOptions: {
            connection,
            pooled: false,
            transactionOptions: { useSavepoints: true },
          },
        });

        const db = pongo.db();

        await db.withTransaction(async (outer) => {
          await outer.execute.command(
            SQL`INSERT INTO ${SQL.identifier(tableName)} (id) VALUES (1)`,
          );

          await outer.withTransaction(async (inner) => {
            await inner.execute.command(
              SQL`INSERT INTO ${SQL.identifier(tableName)} (id) VALUES (2)`,
            );

            return { success: false, result: undefined };
          });
        });

        const result = await connection.execute.query<{ count: number }>(
          SQL`SELECT COUNT(*) as count FROM ${SQL.identifier(tableName)}`,
        );

        assert.strictEqual(Number(result.rows[0]?.count), 1);
      });
    } finally {
      await pool.close();
    }
  });
});
