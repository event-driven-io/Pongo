import { type Dumbo, dumbo, rawSql, tableExists } from '@event-driven-io/dumbo';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import { after, before, beforeEach, describe, it } from 'node:test';
import { pongoClient, type PongoClient, pongoSchema } from '../../core';

void describe('Migration Integration Tests', () => {
  let pool: Dumbo;
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;
  let client: PongoClient;

  const schema = pongoSchema.client({
    database: pongoSchema.db({
      users: pongoSchema.collection('users'),
      roles: pongoSchema.collection('roles'),
    }),
  });

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    connectionString = postgres.getConnectionUri();
    pool = dumbo({ connectionString });
    client = pongoClient(connectionString, {
      schema: { autoMigration: 'CreateOrUpdate', definition: schema },
    });
  });

  after(async () => {
    await pool.close();
    await postgres.stop();
  });

  beforeEach(async () => {
    await pool.execute.query(
      rawSql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'),
    );
  });

  void it('should apply multiple migrations sequentially', async () => {
    await client.db().schema.migrate();

    const usersTableExists = await tableExists(pool, 'users');
    const rolesTableExists = await tableExists(pool, 'roles');

    assert.ok(usersTableExists, 'The users table should exist.');
    assert.ok(rolesTableExists, 'The roles table should exist.');
  });

  void it('should correctly apply a migration if the hash matches the previous migration with the same name', async () => {
    await client.db().schema.migrate();

    // Attempt to run the same migration again with the same content
    await client.db().schema.migrate();

    const migrationNames = await pool.execute.query<{ name: number }>(
      rawSql('SELECT name FROM migrations'),
    );
    assert.strictEqual(
      migrationNames.rowCount,
      2,
      'The migration should only be applied once.',
    );
    assert.deepEqual(
      migrationNames.rows.map((r) => r.name),
      [
        'pongoCollection:users:001:createtable',
        'pongoCollection:roles:001:createtable',
      ],
    );
  });
});
