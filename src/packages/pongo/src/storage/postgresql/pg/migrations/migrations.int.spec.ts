import { dumbo, SQL, type Dumbo } from '@event-driven-io/dumbo';
import {
  PostgreSQLConnectionString,
  tableExists,
} from '@event-driven-io/dumbo/pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import assert from 'assert';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { pongoDriver } from '..';
import { pongoClient, pongoSchema, type PongoClient } from '../../../../core';

describe('Migration Integration Tests', () => {
  let pool: Dumbo;
  let postgres: StartedPostgreSqlContainer;
  let connectionString: PostgreSQLConnectionString;
  let client: PongoClient;

  const schema = pongoSchema.client({
    database: pongoSchema.db({
      users: pongoSchema.collection('users'),
      roles: pongoSchema.collection('roles'),
      crmUsers: pongoSchema.collection('users', {
        schema: 'crm',
        indexes: [pongoSchema.index.unique('users_email_uq', 'email')],
      }),
    }),
  });

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = PostgreSQLConnectionString(postgres.getConnectionUri());
    pool = dumbo({ connectionString });
    client = pongoClient({
      driver: pongoDriver,
      connectionString,
      schema: { autoMigration: 'CreateOrUpdate', definition: schema },
    });
  });

  afterAll(async () => {
    await client.close();
    await pool.close();
    await postgres.stop();
  });

  beforeEach(async () => {
    await pool.execute.query(
      SQL`DROP SCHEMA IF EXISTS crm CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;`,
    );
  });

  it('should apply multiple migrations sequentially', async () => {
    await client.db().schema.migrate();

    const usersTableExists = await tableExists(pool.execute, 'users');
    const rolesTableExists = await tableExists(pool.execute, 'roles');
    const crmUsersTableExists = await pool.execute.query<{ exists: boolean }>(
      SQL`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'crm' AND table_name = 'users'
        )`,
    );
    const crmUsersEmailIndexExists = await pool.execute.query<{
      exists: boolean;
    }>(
      SQL`
        SELECT EXISTS (
          SELECT FROM pg_indexes
          WHERE schemaname = 'crm' AND tablename = 'users' AND indexname = 'users_email_uq'
        )`,
    );

    assert.ok(usersTableExists, 'The users table should exist.');
    assert.ok(rolesTableExists, 'The roles table should exist.');
    assert.strictEqual(
      crmUsersTableExists.rows[0]?.exists,
      true,
      'The crm.users table should exist.',
    );
    assert.strictEqual(
      crmUsersEmailIndexExists.rows[0]?.exists,
      true,
      'The crm.users email index should exist.',
    );
  });

  it('uses default and explicit schemas in runtime collection calls', async () => {
    await client.db().schema.migrate();

    const defaultUsers = client.db().collection('users');
    const crmUsers = client.db().collection('users', { schema: 'crm' });

    await defaultUsers.insertOne({ _id: 'public-user', email: 'public@test' });
    await crmUsers.insertOne({ _id: 'crm-user', email: 'crm@test' });

    const defaultCount = await pool.execute.query<{ count: number }>(
      SQL`SELECT COUNT(*)::int as count FROM public.users`,
    );
    const crmCount = await pool.execute.query<{ count: number }>(
      SQL`SELECT COUNT(*)::int as count FROM crm.users`,
    );

    assert.strictEqual(defaultCount.rows[0]?.count, 1);
    assert.strictEqual(crmCount.rows[0]?.count, 1);
  });

  it('should correctly apply a migration if the hash matches the previous migration with the same name', async () => {
    await client.db().schema.migrate();

    // Attempt to run the same migration again with the same content
    await client.db().schema.migrate();

    const migrationNames = await pool.execute.query<{ name: number }>(
      SQL`SELECT name FROM dmb_migrations`,
    );
    assert.strictEqual(
      migrationNames.rowCount,
      4,
      'The migration should only be applied once.',
    );
    assert.deepEqual(
      migrationNames.rows.map((r) => r.name),
      [
        'pongoCollection:users:001:createtable',
        'pongoCollection:roles:001:createtable',
        'pongoCollection:crm:users:001:createtable',
        'pongoCollection:crm:users:002:index:users_email_uq',
      ],
    );
  });
});
