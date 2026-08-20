import { dumbo, JSONSerializer } from '@event-driven-io/dumbo';
import { pgDumboDriver } from '@event-driven-io/dumbo/pg';
import assert from 'node:assert';
import pg from 'pg';
import { describe, it } from 'vitest';
import { pgDriver } from './index';

const connectionString = 'postgresql://localhost/connected';

describe('PostgreSQL Pongo driver resolution', () => {
  it('rejects an ambient pool connected to another database', () => {
    const pool = new pg.Pool({ connectionString, database: 'connected' });

    try {
      assert.throws(
        () =>
          pgDriver.databaseFactory({
            connectionString,
            connectionOptions: { pool },
            databaseName: 'requested',
            defaultSchemaName: 'public',
            serializer: JSONSerializer,
          }),
        /ambient PostgreSQL connection is connected to database connected and cannot be used for requested/,
      );
    } finally {
      void pool.end();
    }
  });

  it('rejects an ambient client connected to another database', () => {
    assert.throws(
      () =>
        pgDriver.databaseFactory({
          connectionString,
          connectionOptions: { client: new pg.Client({ connectionString }) },
          databaseName: 'requested',
          defaultSchemaName: 'public',
          serializer: JSONSerializer,
        }),
      /ambient PostgreSQL connection is connected to database connected and cannot be used for requested/,
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
      assert.throws(
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
        /ambient PostgreSQL connection is connected to database connected and cannot be used for requested/,
      );
    } finally {
      await pool.close();
    }
  });
});
