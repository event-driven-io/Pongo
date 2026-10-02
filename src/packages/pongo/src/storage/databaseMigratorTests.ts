import {
  PendingMigrationsError,
  SQL,
  type MigrationStyle,
} from '@event-driven-io/dumbo';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { PongoClient } from '../core';

type User = { name: string };
type Order = { total: number };

const assertRejectsWithPendingMigrations = (
  operation: Promise<unknown>,
  migrationNames: string[],
) =>
  assert.rejects(operation, (error) => {
    assert.ok(error instanceof PendingMigrationsError);
    assert.deepEqual(
      error.pendingMigrations.map(({ name }) => name),
      migrationNames,
    );
    return true;
  });

export const databaseMigratorTests = (options: {
  client: (autoMigration: MigrationStyle) => PongoClient;
  tables: () => Promise<string[]>;
  supportsRollback?: boolean;
}) => {
  describe('with automatic migration disabled', () => {
    it('reports pending migrations of registered collections', async () => {
      const db = options.client('None').db();
      db.collection<User>('users');

      await assertRejectsWithPendingMigrations(db.schema.ensureMigrated(), [
        'table:pongo_collection:users:create',
      ]);
    });

    it('rejects collection operations without creating tables while migrations are pending', async () => {
      const users = options.client('None').db().collection<User>('users');

      await assert.rejects(
        users.insertOne({ name: 'Oskar' }),
        PendingMigrationsError,
      );

      assert.deepEqual(await options.tables(), []);
    });

    it('rejects raw SQL while migrations are pending', async () => {
      const db = options.client('None').db();
      db.collection<User>('users');

      await assert.rejects(
        db.sql.query(SQL`SELECT 1 AS one`),
        PendingMigrationsError,
      );
    });

    it('runs operations on collections migrated by another client', async () => {
      const provisioningDb = options.client('None').db();
      provisioningDb.collection<User>('users');
      await provisioningDb.schema.migrate();
      const users = options.client('None').db().collection<User>('users');

      await users.insertOne({ name: 'Oskar' });

      assert.equal((await users.findOne({ name: 'Oskar' }))?.name, 'Oskar');
    });

    it('reports a collection registered after migrations were ensured', async () => {
      const db = options.client('None').db();
      db.collection<User>('users');
      await db.schema.migrate();
      await db.schema.ensureMigrated();

      db.collection<Order>('orders');

      await assertRejectsWithPendingMigrations(db.schema.ensureMigrated(), [
        'table:pongo_collection:orders:create',
      ]);
    });

    it('keeps checking the configured migration table after migrating with another one', async () => {
      const db = options.client('None').db();
      db.collection<User>('users');
      await db.schema.migrate({
        migrationTable: { tableName: 'app_migrations' },
      });

      await assertRejectsWithPendingMigrations(db.schema.ensureMigrated(), [
        'table:pongo_collection:users:create',
      ]);
    });
  });

  describe('with automatic migration', () => {
    it('creates a collection registered after earlier operations', async () => {
      const db = options.client('CreateOrUpdate').db();
      await db.collection<User>('users').insertOne({ name: 'Oskar' });
      const orders = db.collection<Order>('orders');

      await orders.insertOne({ total: 10 });

      assert.equal((await orders.findOne({ total: 10 }))?.total, 10);
    });

    it('creates registered collections before running raw SQL', async () => {
      const db = options.client('CreateOrUpdate').db();
      db.collection<User>('users');

      const rows = await db.sql.query(SQL`SELECT * FROM users`);

      assert.deepEqual(rows, []);
    });
  });

  if (options.supportsRollback !== false) {
    describe('with sessions', () => {
      it('does not apply migrations in a dry run', async () => {
        const client = options.client('None');
        const db = client.db();
        db.collection<User>('users');

        await client.withSession((session) =>
          db.schema.migrate({ session, dryRun: true }),
        );

        assert.deepEqual(await options.tables(), []);
      });

      it('reports pending migrations after a migration in a rolled-back transaction', async () => {
        const client = options.client('None');
        const db = client.db();
        db.collection<User>('users');
        await client.withSession(async (session) => {
          session.startTransaction();
          await db.schema.migrate({ session });
          await session.abortTransaction();
        });

        await assertRejectsWithPendingMigrations(db.schema.ensureMigrated(), [
          'table:pongo_collection:users:create',
        ]);
      });

      it('runs operations on a collection first used in a rolled-back transaction', async () => {
        const client = options.client('CreateOrUpdate');
        const users = client.db().collection<User>('users');
        await client.withSession(async (session) => {
          session.startTransaction();
          await users.insertOne({ name: 'Oskar' }, { session });
          await session.abortTransaction();
        });

        await users.insertOne({ name: 'Anita' });

        assert.deepEqual(
          (await users.find({})).map(({ name }) => name),
          ['Anita'],
        );
      });

      it('creates a collection registered inside a transaction that has written', async () => {
        const client = options.client('CreateOrUpdate');
        const db = client.db();
        const users = db.collection<User>('users');
        await users.insertOne({ name: 'Oskar' });

        await client.withSession((session) =>
          session.withTransaction(async (session) => {
            await users.insertOne({ name: 'Anita' }, { session });
            await db
              .collection<Order>('orders')
              .insertOne({ total: 10 }, { session });
          }),
        );

        const orders = db.collection<Order>('orders');
        assert.equal((await orders.findOne({ total: 10 }))?.total, 10);
      });
    });
  }
};
