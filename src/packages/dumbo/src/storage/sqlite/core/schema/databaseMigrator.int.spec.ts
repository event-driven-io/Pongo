import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  dumbo,
  schemaComponent,
  SQL,
  sqlMigration,
  databaseMigrator,
  PendingMigrationsError,
} from '../../../..';
import { SQLite3DriverType } from '../../sqlite3';
import { InMemorySQLiteDatabase } from '..';

const component = (sql = SQL`CREATE TABLE example (id INTEGER)`) =>
  schemaComponent('test', {
    migrations: () => [sqlMigration('example:create', [sql])],
  });
const poolFor = () =>
  dumbo({
    connectionString: InMemorySQLiteDatabase,
    driverType: SQLite3DriverType,
  });

describe('SQLite database migration assurance', () => {
  it('reports missing migrations without creating schema when automatic migration is disabled', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({
        pool,
        component: component(),
        autoMigration: 'None',
      });

      await assert.rejects(migrator.ensureMigrated(), (error) => {
        assert.ok(error instanceof PendingMigrationsError);
        assert.deepEqual(
          error.pendingMigrations.map(({ name }) => name),
          ['example:create'],
        );
        return true;
      });

      const tables = await pool.execute.query(
        SQL`SELECT name FROM sqlite_master WHERE type = 'table'`,
      );
      assert.deepEqual(tables.rows, []);
    } finally {
      await pool.close();
    }
  });

  it('assures explicitly provisioned schema when automatic migration is disabled', async () => {
    const pool = poolFor();
    try {
      await databaseMigrator({ pool, component: component() }).migrate();
      const migrator = databaseMigrator({
        pool,
        component: component(),
        autoMigration: 'None',
      });

      await migrator.ensureMigrated();

      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });

  it('reports a changed migration hash when automatic migration is disabled', async () => {
    const pool = poolFor();
    try {
      await databaseMigrator({ pool, component: component() }).migrate();
      const migrator = databaseMigrator({
        pool,
        component: component(SQL`CREATE TABLE example (id TEXT)`),
        autoMigration: 'None',
      });

      await assert.rejects(migrator.ensureMigrated(), PendingMigrationsError);
    } finally {
      await pool.close();
    }
  });

  it('allows a changed hash when hash checking is disabled for the migrator', async () => {
    const pool = poolFor();
    try {
      await databaseMigrator({ pool, component: component() }).migrate();
      const migrator = databaseMigrator({
        pool,
        component: component(SQL`CREATE TABLE example (id TEXT)`),
        autoMigration: 'None',
        ignoreMigrationHashMismatch: true,
      });

      await migrator.ensureMigrated();

      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });

  it('allows a changed hash when hash checking is disabled for the migration', async () => {
    const pool = poolFor();
    try {
      await databaseMigrator({ pool, component: component() }).migrate();
      const ignored = schemaComponent('test', {
        migrations: () => [
          sqlMigration(
            'example:create',
            [SQL`CREATE TABLE example (id TEXT)`],
            { ignoreHashMismatch: true },
          ),
        ],
      });
      const migrator = databaseMigrator({
        pool,
        component: ignored,
        autoMigration: 'None',
      });

      await migrator.ensureMigrated();

      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });

  it('ignores migration history outside its component', async () => {
    const pool = poolFor();
    try {
      await databaseMigrator({ pool, component: component() }).migrate();
      const migrator = databaseMigrator({
        pool,
        component: schemaComponent('empty'),
        autoMigration: 'None',
      });

      await migrator.ensureMigrated();

      const history = await pool.execute.query(
        SQL`SELECT name FROM dmb_migrations WHERE name = 'example:create'`,
      );
      assert.equal(history.rows.length, 1);
    } finally {
      await pool.close();
    }
  });

  it('shares concurrent assurance while provisioning the schema', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({ pool, component: component() });

      const first = migrator.ensureMigrated();
      const second = migrator.ensureMigrated();
      await Promise.all([first, second]);

      assert.equal(first, second);
      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });

  it('provisions the schema after a dry run', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({ pool, component: component() });
      await migrator.migrate({ dryRun: true });
      const before = await pool.execute.query(
        SQL`SELECT name FROM sqlite_master WHERE type = 'table'`,
      );
      assert.deepEqual(before.rows, []);

      await migrator.ensureMigrated();

      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });

  it('shares explicit provisioning with concurrent assurance', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({ pool, component: component() });

      const first = migrator.migrate();
      const second = migrator.migrate();
      await Promise.all([first, second, migrator.ensureMigrated()]);

      assert.equal(first, second);
      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });

  it('remembers successful assurance for its schema graph', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({ pool, component: component() });
      await migrator.ensureMigrated();
      // Removing history makes any repeated provisioning fail on the existing table.
      await pool.execute.command(SQL`DROP TABLE dmb_migrations`);

      await migrator.ensureMigrated();

      const tables = await pool.execute.query(
        SQL`SELECT name FROM sqlite_master WHERE name = 'dmb_migrations'`,
      );
      assert.deepEqual(tables.rows, []);
    } finally {
      await pool.close();
    }
  });

  it('retries assurance after failed SQL is repaired', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({
        pool,
        component: component(
          SQL`CREATE TABLE example AS SELECT id FROM prerequisite`,
        ),
      });
      await assert.rejects(migrator.ensureMigrated(), /prerequisite/);
      await pool.execute.command(SQL`CREATE TABLE prerequisite (id INTEGER)`);
      await pool.execute.command(
        SQL`INSERT INTO prerequisite (id) VALUES (42)`,
      );

      await migrator.ensureMigrated();

      const result = await pool.execute.query<{ id: number }>(
        SQL`SELECT id FROM example`,
      );
      assert.deepEqual(result.rows, [{ id: 42 }]);
    } finally {
      await pool.close();
    }
  });

  it('rolls back schema changes when migration SQL fails', async () => {
    const pool = poolFor();
    try {
      const failing = schemaComponent('test', {
        migrations: () => [
          sqlMigration('example:create', [
            SQL`CREATE TABLE example (id INTEGER)`,
            SQL`INSERT INTO missing_table VALUES (1)`,
          ]),
        ],
      });
      const migrator = databaseMigrator({ pool, component: failing });

      await assert.rejects(migrator.ensureMigrated(), /missing_table/);

      const tables = await pool.execute.query(
        SQL`SELECT name FROM sqlite_master WHERE type = 'table'`,
      );
      assert.deepEqual(tables.rows, []);
    } finally {
      await pool.close();
    }
  });

  it('waits for concurrent explicit provisioning with automatic migrations disabled', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({
        pool,
        component: component(),
        autoMigration: 'None',
      });

      await Promise.all([migrator.migrate(), migrator.ensureMigrated()]);

      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });

  it('keeps a configured dry run when a call omits its override value', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({
        pool,
        component: component(),
        dryRun: true,
      });

      await migrator.migrate({ dryRun: undefined });

      const tables = await pool.execute.query(
        SQL`SELECT name FROM sqlite_master WHERE type = 'table'`,
      );
      assert.deepEqual(tables.rows, []);
    } finally {
      await pool.close();
    }
  });

  it('runs assurance again after configured dry runs', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({
        pool,
        component: component(),
        dryRun: true,
      });
      await migrator.ensureMigrated();
      // A second execution must see the invalid schema instead of returning cached success.
      await pool.execute.command(SQL`CREATE TABLE example (id INTEGER)`);

      await assert.rejects(migrator.ensureMigrated(), /already exists/);
    } finally {
      await pool.close();
    }
  });

  it('allows a call to override configured dry runs', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({
        pool,
        component: component(),
        dryRun: true,
      });

      await migrator.migrate({ dryRun: false });

      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });

  it('keeps configured hash-ignore settings when a call omits its override value', async () => {
    const pool = poolFor();
    try {
      await databaseMigrator({ pool, component: component() }).migrate();
      const migrator = databaseMigrator({
        pool,
        component: component(SQL`CREATE TABLE example (id TEXT)`),
        ignoreMigrationHashMismatch: true,
      });

      await migrator.migrate({ ignoreMigrationHashMismatch: undefined });

      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });

  it('rolls back a dry run when an executor is supplied', async () => {
    const pool = poolFor();
    try {
      const migrator = databaseMigrator({
        pool,
        component: component(),
        execute: pool.execute,
      });

      await migrator.migrate({ dryRun: true });

      const tables = await pool.execute.query(
        SQL`SELECT name FROM sqlite_master WHERE type = 'table'`,
      );
      assert.deepEqual(tables.rows, []);
    } finally {
      await pool.close();
    }
  });

  it('honors different hash-checking options on concurrent explicit migrations', async () => {
    const pool = poolFor();
    try {
      await databaseMigrator({ pool, component: component() }).migrate();
      const migrator = databaseMigrator({
        pool,
        component: component(SQL`CREATE TABLE example (id TEXT)`),
      });

      const checkingHash = migrator.migrate({
        ignoreMigrationHashMismatch: false,
      });
      const ignoringHash = migrator.migrate({
        ignoreMigrationHashMismatch: true,
      });
      await Promise.all([ignoringHash, assert.rejects(checkingHash, /hash/i)]);

      const columns = await pool.execute.query<{ type: string }>(
        SQL`PRAGMA table_info(example)`,
      );
      assert.equal(columns.rows[0]?.type, 'INTEGER');
    } finally {
      await pool.close();
    }
  });
});
