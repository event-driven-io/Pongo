import { SQL } from '@event-driven-io/dumbo';
import {
  SQLiteConnectionString,
  sqlite3Pool,
} from '@event-driven-io/dumbo/sqlite3';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, it } from 'vitest';
import { pongoClient, pongoSchema } from '../../../core';
import { sqlite3Driver } from '.';

describe('SQLite3 migration integration', () => {
  const fileName = path.resolve(
    '/tmp',
    `pongo-sqlite3-migrations-${randomUUID()}.db`,
  );
  const connectionString = SQLiteConnectionString(`file:${fileName}`);

  afterEach(() => {
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.unlinkSync(`${fileName}${suffix}`);
      } catch {
        // ignore missing files
      }
    }
  });

  it('applies default and schema-prefixed collection migrations in order', async () => {
    const schema = pongoSchema.client({
      database: pongoSchema.db({
        users: pongoSchema.collection('users'),
        explicitDefaultUsers: pongoSchema.collection('explicit_default_users', {
          schema: pongoSchema.schema.defaultName,
          indexes: [pongoSchema.index('explicit_default_email_idx', 'email')],
        }),
        crmUsers: pongoSchema.collection('users', {
          schema: 'crm',
          indexes: [
            pongoSchema.index('users_email_idx', 'email'),
            pongoSchema.index.unique('users_external_id_uq', [
              'external',
              'id',
            ]),
            pongoSchema.index.json('users_data_idx'),
            {
              name: 'users_custom_data_idx',
              type: 'custom_json_index',
              sql: ({ tableReference }) =>
                SQL`CREATE INDEX IF NOT EXISTS users_custom_data_idx ON ${tableReference} (data)`,
            },
          ],
        }),
        auditUsers: pongoSchema.collection('users', {
          schema: 'audit',
          indexes: [pongoSchema.index('audit_users_email_idx', 'email')],
        }),
      }),
    });
    const client = pongoClient({
      driver: sqlite3Driver,
      connectionString,
      schema: { definition: schema },
    });
    const pool = sqlite3Pool({ fileName });

    try {
      await client.db().schema.migrate();
      await client.db().schema.migrate();

      await client
        .db()
        .collection('users')
        .insertOne({ _id: 'default-user', email: 'default@test' });
      await client
        .db()
        .collection('users', { schema: 'crm' })
        .insertOne({ _id: 'crm-user', email: 'crm@test' });

      const objects = await pool.execute.query<{ name: string; type: string }>(
        SQL`
          SELECT name, type
          FROM sqlite_master
          WHERE name IN (
            'users',
            'explicit_default_users',
            'crm_users',
            'audit_users',
            'explicit_default_email_idx',
            'users_email_idx',
            'users_external_id_uq',
            'users_data_idx',
            'users_custom_data_idx',
            'audit_users_email_idx'
          )
          ORDER BY type, name`,
      );
      const migrationNames = await pool.execute.query<{ name: string }>(
        SQL`SELECT name FROM dmb_migrations ORDER BY id`,
      );
      const defaultCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM users`,
      );
      const crmCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM crm_users`,
      );
      const auditCount = await pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*) as count FROM audit_users`,
      );

      assert.deepStrictEqual(objects.rows, [
        { name: 'audit_users', type: 'table' },
        { name: 'crm_users', type: 'table' },
        { name: 'explicit_default_users', type: 'table' },
        { name: 'users', type: 'table' },
      ]);
      assert.deepStrictEqual(
        migrationNames.rows.map((row) => row.name),
        [
          'pongoCollection:__default_database_schema__:users:001:createtable',
          'pongoCollection:__default_database_schema__:explicit_default_users:001:createtable',
          'pongoCollection:crm:users:001:createtable',
          'pongoCollection:audit:users:001:createtable',
        ],
      );
      assert.strictEqual(defaultCount.rows[0]?.count, 1);
      assert.strictEqual(crmCount.rows[0]?.count, 1);
      assert.strictEqual(auditCount.rows[0]?.count, 0);
    } finally {
      await client.close();
      await pool.close();
    }
  });
});
