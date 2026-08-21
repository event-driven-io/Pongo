import { DumboError, dumbo, JSONSerializer } from '@event-driven-io/dumbo';
import { pgDumboDriver } from '@event-driven-io/dumbo/pg';
import assert from 'node:assert';
import pg from 'pg';
import { describe, it } from 'vitest';
import { pgDriver } from './index';

const connectionString = 'postgresql://localhost/connected';
const ambientDatabaseMismatchMessage =
  'The ambient PostgreSQL connection is connected to database connected and cannot be used for requested';

const assertThrowsPongoError = (
  operation: () => unknown,
  message: string,
): void => {
  assert.throws(operation, (error: unknown) => {
    assert.ok(DumboError.isInstanceOf(error));
    assert.strictEqual(error.errorType, 'PongoError');
    assert.strictEqual(error.errorCode, 500);
    assert.strictEqual(error.message, message);
    return true;
  });
};

describe('PostgreSQL Pongo driver resolution', () => {
  it('rejects an ambient pool connected to another database', () => {
    const pool = new pg.Pool({ connectionString, database: 'connected' });

    try {
      assertThrowsPongoError(
        () =>
          pgDriver.databaseFactory({
            connectionString,
            connectionOptions: { pool },
            databaseName: 'requested',
            defaultSchemaName: 'public',
            serializer: JSONSerializer,
          }),
        ambientDatabaseMismatchMessage,
      );
    } finally {
      void pool.end();
    }
  });

  it('rejects an ambient client connected to another database', () => {
    assertThrowsPongoError(
      () =>
        pgDriver.databaseFactory({
          connectionString,
          connectionOptions: { client: new pg.Client({ connectionString }) },
          databaseName: 'requested',
          defaultSchemaName: 'public',
          serializer: JSONSerializer,
        }),
      ambientDatabaseMismatchMessage,
    );
  });

  it('resolves the ambient database from the client when the pool is not a native pg pool', async () => {
    const pool = dumbo({ connectionString, driver: pgDumboDriver });
    const client = new pg.Client({ connectionString });

    const db = pgDriver.databaseFactory({
      connectionString,
      pool,
      connectionOptions: {
        client,
        transactionOptions: { allowNestedTransactions: true },
      },
      databaseName: 'connected',
      defaultSchemaName: 'public',
      serializer: JSONSerializer,
    });

    try {
      assert.strictEqual(db.databaseName, 'connected');
    } finally {
      await db.close();
      await pool.close();
    }
  });

  it('rejects an ambient client connected to another database when the pool is not a native pg pool', async () => {
    const pool = dumbo({ connectionString, driver: pgDumboDriver });
    const client = new pg.Client({ connectionString });

    try {
      assertThrowsPongoError(
        () =>
          pgDriver.databaseFactory({
            connectionString,
            pool,
            connectionOptions: {
              client,
              transactionOptions: { allowNestedTransactions: true },
            },
            databaseName: 'requested',
            defaultSchemaName: 'public',
            serializer: JSONSerializer,
          }),
        ambientDatabaseMismatchMessage,
      );
    } finally {
      await pool.close();
    }
  });

  it('rejects missing connection string and pool options', () => {
    assertThrowsPongoError(
      () =>
        pgDriver.databaseFactory({
          databaseName: 'requested',
          defaultSchemaName: 'public',
          serializer: JSONSerializer,
        } as unknown as Parameters<typeof pgDriver.databaseFactory>[0]),
      'PostgreSQL connection string or pool is required',
    );
  });
});
