import type { D1Database } from '@cloudflare/workers-types';
import { SQL } from '@event-driven-io/dumbo';
import { d1Pool } from '@event-driven-io/dumbo/cloudflare';
import assert from 'assert';
import { Miniflare } from 'miniflare';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { pongoClient, pongoSchema } from '../../..';
import { d1Driver as databaseDriver } from '../../../storage/sqlite/d1';

type User = {
  _id?: string;
  name: string;
};

const uniqueCollectionName = () =>
  `connections_${randomUUID().replaceAll('-', '')}`;

const isNestedTransactionsDisabledError = (error: unknown): boolean =>
  error instanceof Error &&
  'errorType' in error &&
  error.errorType === 'InvalidOperationError' &&
  error.message.includes('allowNestedTransactions');

describe('Pongo D1 connections', () => {
  let mf: Miniflare;
  let database: D1Database;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db-id' },
    });
    database = await mf.getD1Database('DB');
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it('connects using database passed through connectionOptions', async () => {
    const collectionName = uniqueCollectionName();
    const pongo = pongoClient({
      driver: databaseDriver,
      connectionOptions: {
        database,
        transactionOptions: { mode: 'session_based' },
      },
    });

    try {
      const users = pongo.db().collection<User>(collectionName);
      await users.insertOne({ name: randomUUID() });

      const inserted = await users.findOne({});
      assert.ok(inserted);
    } finally {
      await pongo.close();
    }
  });

  it('runs against the connection passed through connectionOptions', async () => {
    const pool = d1Pool({ database });
    const collectionName = uniqueCollectionName();

    try {
      const connection = await pool.connection();

      const pongo = pongoClient({
        driver: databaseDriver,
        connectionOptions: { connection },
      });

      const firstId = randomUUID();
      const secondId = randomUUID();

      try {
        const users = pongo.db().collection<User>(collectionName);
        await users.insertOne({ _id: firstId, name: randomUUID() });
        await users.insertOne({ _id: secondId, name: randomUUID() });
      } finally {
        await pongo.close();
      }

      const { rows } = await connection.execute.query<{ _id: string }>(
        SQL`SELECT _id FROM ${SQL.identifier(collectionName)} ORDER BY _id`,
      );

      assert.deepStrictEqual(
        rows.map((row) => row._id).sort(),
        [firstId, secondId].sort(),
      );
    } finally {
      await pool.close();
    }
  });

  it('runs schema-prefixed migrations and collection calls', async () => {
    const collectionName = uniqueCollectionName();
    const schemaTableName = `crm.${collectionName}`;
    const emailIndexName = `${collectionName}_email_idx`;
    const uniqueIndexName = `${collectionName}_external_id_uq`;
    const documentIndexName = `${collectionName}_data_idx`;
    const customIndexName = `${collectionName}_custom_idx`;
    const physicalEmailIndexName = `crm.${emailIndexName}`;
    const physicalUniqueIndexName = `crm.${uniqueIndexName}`;
    const physicalDocumentIndexName = `crm.${documentIndexName}`;
    const physicalCustomIndexName = `crm.${customIndexName}`;
    const pongo = pongoClient({
      driver: databaseDriver,
      connectionOptions: {
        database,
        transactionOptions: { mode: 'session_based' },
      },
      schema: {
        definition: pongoSchema.client({
          database: pongoSchema.db({
            schemas: {
              reporting: pongoSchema.schema('reporting', {
                users: pongoSchema.collection(collectionName),
              }),
              crm: pongoSchema.schema('crm', {
                crmUsers: pongoSchema.collection(collectionName, {
                  indexes: {
                    email: pongoSchema.index(emailIndexName, 'email'),
                    externalId: pongoSchema.index.unique(uniqueIndexName, [
                      'external',
                      'id',
                    ]),
                    document: pongoSchema.index.json(documentIndexName),
                    custom: pongoSchema.index.custom(
                      customIndexName,
                      ({ tableReference, indexReference }) =>
                        SQL`CREATE INDEX IF NOT EXISTS ${indexReference} ON ${tableReference} (data)`,
                    ),
                  },
                }),
              }),
            },
          }),
        }),
      },
    });
    const pool = d1Pool({ database });

    try {
      const db = pongo.db('database');
      await db.schema.migrate();
      await db
        .collection(collectionName)
        .insertOne({ _id: 'default-user', email: 'default@test' });
      await db
        .collection(collectionName, { databaseSchemaName: 'crm' })
        .insertOne({ _id: 'crm-user', email: 'crm@test' });

      const objects = await pool.execute.query<{ name: string; type: string }>(
        SQL`
          SELECT name, type
          FROM sqlite_master
          WHERE name IN (
            ${collectionName},
            ${schemaTableName},
            ${physicalEmailIndexName},
            ${physicalUniqueIndexName},
            ${physicalDocumentIndexName},
            ${physicalCustomIndexName}
          )
          ORDER BY type, name`,
      );
      const defaultCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM ${SQL.identifier(collectionName)}`,
      );
      const schemaCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM ${SQL.identifier(schemaTableName)}`,
      );

      assert.deepStrictEqual(objects.rows, [
        { name: physicalCustomIndexName, type: 'index' },
        { name: physicalDocumentIndexName, type: 'index' },
        { name: physicalEmailIndexName, type: 'index' },
        { name: physicalUniqueIndexName, type: 'index' },
        ...[collectionName, schemaTableName]
          .sort()
          .map((name) => ({ name, type: 'table' })),
      ]);
      assert.strictEqual(defaultCount.rows[0]?.count, 1);
      assert.strictEqual(schemaCount.rows[0]?.count, 1);
    } finally {
      await pongo.close();
      await pool.close();
    }
  });

  it('runs nested Pongo transaction on existing D1 connection without nested transaction options', async () => {
    const pool = d1Pool({ database });

    try {
      const connection = await pool.connection();

      const pongo = pongoClient({
        driver: databaseDriver,
        connectionOptions: {
          connection,
          transactionOptions: { mode: 'session_based' },
        },
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

  it('respects explicitly disabled nested transactions on existing D1 connection', async () => {
    const pool = d1Pool({ database });

    try {
      const connection = await pool.connection();

      const pongo = pongoClient({
        driver: databaseDriver,
        connectionOptions: {
          connection,
          transactionOptions: {
            allowNestedTransactions: false,
            mode: 'session_based',
          },
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
});
