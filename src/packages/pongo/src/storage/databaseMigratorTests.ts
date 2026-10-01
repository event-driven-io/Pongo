import {
  PendingMigrationsError,
  type MigrationStyle,
} from '@event-driven-io/dumbo';
import assert from 'node:assert/strict';
import { it } from 'vitest';
import type { PongoClient } from '../core';

export const databaseMigratorTests = (options: {
  client: (autoMigration: MigrationStyle) => PongoClient;
  tables: () => Promise<string[]>;
  supportsRollback?: boolean;
}) => {
  it('reports pending migrations without creating collections or migration history', async () => {
    const db = options.client('None').db();
    const users = db.collection<{ name: string }>('users');
    assert.equal('migrate' in users.schema, false);
    const before = await options.tables();
    await assert.rejects(db.schema.ensureMigrated(), (error: unknown) => {
      assert.ok(error instanceof PendingMigrationsError);
      assert.ok(error.pendingMigrations.length > 0);
      return true;
    });
    await assert.rejects(
      users.insertOne({ name: 'Oskar' }),
      PendingMigrationsError,
    );
    assert.deepEqual(await options.tables(), before);
  });

  it('explicitly provisions under None and assures a fresh database instance from history', async () => {
    const db = options.client('None').db();
    db.collection<{ name: string }>('users');
    await db.schema.migrate();
    const runtime = options.client('None').db();
    const users = runtime.collection<{ name: string }>('users');
    await Promise.all([
      runtime.schema.ensureMigrated(),
      runtime.schema.ensureMigrated(),
    ]);
    await users.insertOne({ name: 'Oskar' });
    assert.equal((await users.findOne({ name: 'Oskar' }))?.name, 'Oskar');
    assert.ok(runtime.schema.sql().includes('users'));
    assert.ok(!runtime.schema.sql().includes('dmb_migrations'));
  });

  it('checks newly registered collections after earlier assurance succeeds', async () => {
    const db = options.client('None').db();
    db.collection('users');
    await db.schema.migrate();
    await db.schema.ensureMigrated();
    const original = db.schema.component;
    const orders = db.collection<{ total: number }>('orders');
    assert.notEqual(db.schema.component, original);
    await assert.rejects(db.schema.ensureMigrated(), PendingMigrationsError);
    assert.ok(!(await options.tables()).includes('orders'));
    await db.schema.migrate();
    await orders.insertOne({ total: 10 });
  });

  it('automatically provisions an expanded database graph with CreateOrUpdate', async () => {
    const db = options.client('CreateOrUpdate').db();
    await db.collection<{ name: string }>('users').insertOne({ name: 'Oskar' });
    const orders = db.collection<{ total: number }>('orders');
    await orders.insertOne({ total: 10 });
    assert.equal((await orders.findOne({ total: 10 }))?.total, 10);
  });

  if (options.supportsRollback !== false) {
    it('rolls back dry runs with an inactive session without satisfying assurance', async () => {
      const client = options.client('None');
      const db = client.db();
      db.collection('users');
      const before = await options.tables();
      const session = client.startSession();
      try {
        await db.schema.migrate({ session, dryRun: true });
        assert.deepEqual(await options.tables(), before);
        await assert.rejects(
          db.schema.ensureMigrated(),
          PendingMigrationsError,
        );
      } finally {
        await session.endSession();
      }
    });

    it('checks migration history again after an outer migration transaction rolls back', async () => {
      const client = options.client('None');
      const db = client.db();
      db.collection('users');
      const session = client.startSession();
      try {
        session.startTransaction();
        await db.schema.migrate({ session });
        await session.abortTransaction();
        await assert.rejects(
          db.schema.ensureMigrated(),
          PendingMigrationsError,
        );
        await db.schema.migrate();
        await db.schema.ensureMigrated();
      } finally {
        await session.endSession();
      }
    });
  }
};
