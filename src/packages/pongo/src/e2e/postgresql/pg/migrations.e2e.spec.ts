import {
  dumbo,
  PendingMigrationsError,
  SQL,
  type Dumbo,
} from '@event-driven-io/dumbo';
import { PostgreSQLConnectionString } from '@event-driven-io/dumbo/pg';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'node:assert/strict';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'vitest';
import { pongoClient, type PongoClient } from '../../..';
import { pongoDriver } from '../../../pg';

type User = { name: string; age: number };
type Order = { total: number };

describe('PostgreSQL schema migrations', () => {
  let postgres: StartedPostgreSqlContainer;
  let pool: Dumbo;
  let provisioningConnectionString: PostgreSQLConnectionString;
  let runtimeConnectionString: PostgreSQLConnectionString;
  let clients: PongoClient[];

  const client = (connectionString: PostgreSQLConnectionString) => {
    const created = pongoClient({
      driver: pongoDriver,
      connectionString,
      schema: { autoMigration: 'None' },
    });
    clients.push(created);
    return created;
  };

  const provisionUsers = async () => {
    const db = client(provisioningConnectionString).db();
    db.collection<User>('users');
    await db.schema.migrate({ migrationStyle: 'CreateOrUpdate' });
    await pool.execute.command(
      SQL`GRANT USAGE ON SCHEMA public TO pongo_runtime; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pongo_runtime`,
    );
  };

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    provisioningConnectionString = PostgreSQLConnectionString(
      postgres.getConnectionUri(),
    );
    pool = dumbo({ connectionString: provisioningConnectionString });
    await pool.execute.command(
      SQL`CREATE ROLE pongo_runtime LOGIN PASSWORD 'runtime-test'`,
    );
    const runtimeUrl = new URL(provisioningConnectionString);
    runtimeUrl.username = 'pongo_runtime';
    runtimeUrl.password = 'runtime-test';
    runtimeConnectionString = PostgreSQLConnectionString(runtimeUrl.toString());
  });

  beforeEach(async () => {
    clients = [];
    await pool.execute.command(
      SQL`DROP SCHEMA public CASCADE; CREATE SCHEMA public`,
    );
  });

  afterEach(async () => {
    await Promise.all(clients.map((created) => created.close()));
  });

  afterAll(async () => {
    await pool?.close();
    await postgres?.stop();
  });

  it('runtime role that cannot create database objects reads and writes collections migrated by a provisioning client', async () => {
    await provisionUsers();
    const users = client(runtimeConnectionString)
      .db()
      .collection<User>('users');

    await users.insertOne({ name: 'Anita', age: 25 });
    await users.updateOne({ name: 'Anita' }, { $set: { age: 26 } });

    const anita = await users.findOne({ name: 'Anita' });
    assert.equal(anita?.age, 26);
  });

  it('runtime role reports a collection registered only at runtime as pending', async () => {
    await provisionUsers();
    const orders = client(runtimeConnectionString)
      .db()
      .collection<Order>('orders');

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
