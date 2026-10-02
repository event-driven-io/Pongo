import { SQL } from '@event-driven-io/dumbo';
import {
  SQLiteConnectionString,
  sqlite3Pool,
  type Sqlite3Pool,
} from '@event-driven-io/dumbo/sqlite3';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe } from 'vitest';
import { pongoClient, type PongoClient } from '../../../core';
import { schemaComponentMigratorTests } from '../../schemaComponentMigratorTests';
import { sqlite3Driver } from '.';

describe('sqlite3 schema component migrator', () => {
  let fileName: string;
  let pool: Sqlite3Pool;
  let clients: PongoClient[];
  beforeEach(() => {
    fileName = `/tmp/pongo-assurance-${randomUUID()}.db`;
    pool = sqlite3Pool({ fileName });
    clients = [];
  });
  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await pool.close();
    await Promise.all(
      ['', '-wal', '-shm'].map((suffix) =>
        rm(`${fileName}${suffix}`, { force: true }),
      ),
    );
  });
  schemaComponentMigratorTests({
    client: (autoMigration) => {
      const client = pongoClient({
        driver: sqlite3Driver,
        connectionString: SQLiteConnectionString(`file:${fileName}`),
        schema: { autoMigration },
      });
      clients.push(client);
      return client;
    },
    tables: async () =>
      (
        await pool.execute.query<{ name: string }>(
          SQL`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
        )
      ).rows.map(({ name }) => name),
  });
});
