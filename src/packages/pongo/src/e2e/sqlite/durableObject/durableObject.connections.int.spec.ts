import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import {
  cloudflareDurableObjectSQLitePool,
  type CloudflareDurableObjectSQLiteConnectionPool,
} from '@event-driven-io/dumbo/cloudflare';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { aroundEach, describe, it } from 'vitest';
import {
  PongoError,
  pongoClient,
  pongoDriverRegistry,
  pongoSchema,
} from '../../..';
import { cloudflareDurableObjectSQLiteDriver as databaseDriver } from '../../../storage/sqlite/durableObject';

type User = {
  _id?: string;
  name: string;
  email?: string;
};

const uniqueCollectionName = () =>
  `connections_${randomUUID().replaceAll('-', '')}`;

const isNestedTransactionsDisabledError = (error: unknown): boolean =>
  error instanceof Error &&
  'errorType' in error &&
  error.errorType === 'InvalidOperationError' &&
  error.message.includes('allowNestedTransactions');

describe('Pongo Cloudflare Durable Object SQLite connections', () => {
  let storage: DurableObjectStorage;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      await runTest();
    });
  });

  it('connects using top-level storage', async () => {
    const pongo = pongoClient({ driver: databaseDriver, storage });

    try {
      const users = pongo.db().collection<User>(uniqueCollectionName());
      const inserted = await users.insertOne({ name: 'top-level' });

      assert.ok(await users.findOne({ _id: inserted.insertedId! }));
    } finally {
      await pongo.close();
    }
  });

  it('connects using storage passed through connectionOptions', async () => {
    const pongo = pongoClient({
      driver: databaseDriver,
      connectionOptions: { storage },
    });

    try {
      const users = pongo.db().collection<User>(uniqueCollectionName());
      await users.insertOne({ name: 'connection-options' });

      assert.strictEqual(await users.countDocuments({}), 1);
    } finally {
      await pongo.close();
    }
  });

  it('runs against an ambient transaction-capable connection', async () => {
    const pool = cloudflareDurableObjectSQLitePool({ storage });

    try {
      const connection = await pool.connection();
      const collectionName = uniqueCollectionName();
      const pongo = pongoClient({
        driver: databaseDriver,
        connectionOptions: { connection },
      });

      try {
        await pongo
          .db()
          .collection<User>(collectionName)
          .insertOne({ _id: 'ambient', name: 'connection' });

        const result = await connection.execute.query<{ _id: string }>(
          SQL`SELECT _id FROM ${SQL.identifier(collectionName)}`,
        );
        assert.deepStrictEqual(result.rows, [{ _id: 'ambient' }]);
      } finally {
        await pongo.close();
      }
    } finally {
      await pool.close();
    }
  });

  it('runs against a typed Durable Object SQLite pool', async () => {
    const pool: CloudflareDurableObjectSQLiteConnectionPool =
      cloudflareDurableObjectSQLitePool({ storage });
    const pongo = pongoClient({ driver: databaseDriver, pool });

    try {
      const users = pongo.db().collection<User>(uniqueCollectionName());
      await users.insertOne({ name: 'pool' });

      assert.strictEqual(await users.countDocuments({}), 1);
    } finally {
      await pongo.close();
    }
  });

  it('rejects conflicting storage and pool sources at runtime', async () => {
    const pool = cloudflareDurableObjectSQLitePool({ storage });
    const registeredDriver = pongoDriverRegistry.tryGet(
      'SQLite:cloudflareDurableObjectSQLite',
    );
    assert.ok(registeredDriver);

    const options = {
      databaseName: 'requested',
      defaultSchemaName: 'public',
      serializer: JSONSerializer,
      storage,
      pool,
    };

    try {
      assert.throws(
        () => registeredDriver.databaseFactory(options),
        (error: unknown) => {
          assert.ok(error instanceof PongoError);
          assert.strictEqual(
            error.message,
            'Exactly one Durable Object SQLite storage, connection, or pool is required',
          );
          return true;
        },
      );
    } finally {
      await pool.close();
    }
  });

  it('applies declared collection and index migrations', async () => {
    const collectionName = uniqueCollectionName();
    const indexName = `${collectionName}_email_idx`;
    const pongo = pongoClient({
      driver: databaseDriver,
      storage,
      schema: {
        definition: pongoSchema.client({
          app: pongoSchema.db({
            collections: {
              users: pongoSchema.collection<User>(collectionName, {
                indexes: {
                  email: pongoSchema.index(indexName, 'email'),
                },
              }),
            },
          }),
        }),
      },
    });

    try {
      const db = pongo.db('app');
      const migration = await db.schema.migrate();
      await db
        .collection<User>(collectionName)
        .insertOne({ name: 'migrated', email: 'user@example.com' });

      const objects = storage.sql
        .exec<{ name: string; type: string }>(
          `SELECT name, type FROM sqlite_master WHERE name IN (?, ?) ORDER BY type, name`,
          collectionName,
          indexName,
        )
        .toArray();

      assert.ok(migration.applied.length > 0);
      assert.deepStrictEqual(objects, [
        { name: indexName, type: 'index' },
        { name: collectionName, type: 'table' },
      ]);
    } finally {
      await pongo.close();
    }
  });

  it('connects using existing connection from transaction', async () => {
    const pool = cloudflareDurableObjectSQLitePool({ storage });
    const collectionName = uniqueCollectionName();

    try {
      await pool.withTransaction(async ({ connection }) => {
        const pongo = pongoClient({
          driver: databaseDriver,
          connectionOptions: { connection },
        });

        try {
          const users = pongo.db().collection<User>(collectionName);
          await users.insertOne({ name: randomUUID() });
          await users.insertOne({ name: randomUUID() });

          assert.strictEqual(await users.countDocuments({}), 2);
        } finally {
          await pongo.close();
        }
      });
    } finally {
      await pool.close();
    }
  });

  it('runs nested Pongo transaction on existing Dumbo connection without nested transaction options', async () => {
    const pool = cloudflareDurableObjectSQLitePool({ storage });

    try {
      const connection = await pool.connection();
      const pongo = pongoClient({
        driver: databaseDriver,
        connectionOptions: { connection },
      });

      try {
        const db = pongo.db();

        await db.withTransaction((outer) =>
          outer.withTransaction((inner) => inner.execute.query(SQL`SELECT 1`)),
        );
      } finally {
        await pongo.close();
      }
    } finally {
      await pool.close();
    }
  });

  it('respects explicitly disabled nested transactions on existing Dumbo connection', async () => {
    const pool = cloudflareDurableObjectSQLitePool({ storage });

    try {
      const connection = await pool.connection();
      const pongo = pongoClient({
        driver: databaseDriver,
        connectionOptions: {
          connection,
          transactionOptions: { allowNestedTransactions: false },
        },
      });

      try {
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
      } finally {
        await pongo.close();
      }
    } finally {
      await pool.close();
    }
  });

  it('prefers connection transaction options over top-level transaction options', async () => {
    const pongo = pongoClient({
      driver: databaseDriver,
      transactionOptions: { allowNestedTransactions: true },
      connectionOptions: {
        storage,
        transactionOptions: { allowNestedTransactions: false },
      },
    });

    try {
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
    } finally {
      await pongo.close();
    }
  });
});
