import { PendingMigrationsError } from '@event-driven-io/dumbo';
import { SQLiteConnectionString } from '@event-driven-io/dumbo/sqlite3';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { pongoClient, type PongoClient } from '../../..';
import { sqlite3Driver } from '../../../storage/sqlite/sqlite3';

type User = { name: string; age: number };
type Order = { total: number };

describe('SQLite3 schema migrations', () => {
  let fileName: string;
  let clients: PongoClient[];

  const client = () => {
    const created = pongoClient({
      driver: sqlite3Driver,
      connectionString: SQLiteConnectionString(`file:${fileName}`),
      schema: { autoMigration: 'None' },
    });
    clients.push(created);
    return created;
  };

  const provisionUsers = async () => {
    const db = client().db();
    db.collection<User>('users');
    await db.schema.migrate({ migrationStyle: 'CreateOrUpdate' });
  };

  beforeEach(() => {
    fileName = `/tmp/pongo-migrations-${randomUUID()}.db`;
    clients = [];
  });

  afterEach(async () => {
    await Promise.all(clients.map((created) => created.close()));
    await Promise.all(
      ['', '-wal', '-shm'].map((suffix) =>
        rm(`${fileName}${suffix}`, { force: true }),
      ),
    );
  });

  it('runtime client reads and writes collections migrated by a provisioning client', async () => {
    await provisionUsers();
    const users = client().db().collection<User>('users');

    await users.insertOne({ name: 'Anita', age: 25 });
    await users.updateOne({ name: 'Anita' }, { $set: { age: 26 } });

    const anita = await users.findOne({ name: 'Anita' });
    assert.equal(anita?.age, 26);
  });

  it('runtime client reports a collection registered only at runtime as pending', async () => {
    await provisionUsers();
    const orders = client().db().collection<Order>('orders');

    await assert.rejects(orders.insertOne({ total: 10 }), (error) => {
      assert.ok(error instanceof PendingMigrationsError);
      assert.deepEqual(
        error.pendingMigrations.map(({ name }) => name),
        ['table:pongo_collection:orders:create'],
      );
      return true;
    });
  });
});
