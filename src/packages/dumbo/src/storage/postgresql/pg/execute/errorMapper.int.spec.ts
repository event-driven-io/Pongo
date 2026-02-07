import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import { after, before, describe, it } from 'node:test';
import {
  CheckViolationError,
  DataError,
  DumboError,
  ForeignKeyViolationError,
  IntegrityConstraintViolationError,
  InvalidOperationError,
  NotNullViolationError,
  SQL,
  TransientDatabaseError,
  UniqueConstraintError,
} from '../../../../core';
import { pgPool } from '../connections';

void describe('PostgreSQL error mapping', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;

  before(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = postgres.getConnectionUri();
  });

  after(async () => {
    await postgres.stop();
  });

  void describe('integrity constraint violations', () => {
    void it('maps unique constraint violation to UniqueConstraintError', async () => {
      const pool = pgPool({ connectionString });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_unique (id INT PRIMARY KEY, value TEXT)`,
        );
        await pool.execute.command(
          SQL`INSERT INTO test_unique (id, value) VALUES (1, 'a')`,
        );

        await assert.rejects(
          () =>
            pool.execute.command(
              SQL`INSERT INTO test_unique (id, value) VALUES (1, 'b')`,
            ),
          (error) => {
            assert.ok(error instanceof UniqueConstraintError);
            assert.ok(error instanceof IntegrityConstraintViolationError);
            assert.ok(error instanceof DumboError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: UniqueConstraintError.ErrorType,
              }),
            );
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorCode: IntegrityConstraintViolationError.ErrorCode,
              }),
            );
            assert.ok(error.innerError);
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_unique`);
        await pool.close();
      }
    });

    void it('maps NOT NULL violation to NotNullViolationError', async () => {
      const pool = pgPool({ connectionString });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_notnull (id INT PRIMARY KEY, value TEXT NOT NULL)`,
        );

        await assert.rejects(
          () =>
            pool.execute.command(
              SQL`INSERT INTO test_notnull (id, value) VALUES (1, NULL)`,
            ),
          (error) => {
            assert.ok(error instanceof NotNullViolationError);
            assert.ok(error instanceof IntegrityConstraintViolationError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: NotNullViolationError.ErrorType,
              }),
            );
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_notnull`);
        await pool.close();
      }
    });

    void it('maps foreign key violation to ForeignKeyViolationError', async () => {
      const pool = pgPool({ connectionString });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_parent (id INT PRIMARY KEY)`,
        );
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_child (id INT PRIMARY KEY, parent_id INT REFERENCES test_parent(id))`,
        );

        await assert.rejects(
          () =>
            pool.execute.command(
              SQL`INSERT INTO test_child (id, parent_id) VALUES (1, 999)`,
            ),
          (error) => {
            assert.ok(error instanceof ForeignKeyViolationError);
            assert.ok(error instanceof IntegrityConstraintViolationError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: ForeignKeyViolationError.ErrorType,
              }),
            );
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_child`);
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_parent`);
        await pool.close();
      }
    });

    void it('maps CHECK violation to CheckViolationError', async () => {
      const pool = pgPool({ connectionString });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_check (id INT PRIMARY KEY, value INT CHECK (value > 0))`,
        );

        await assert.rejects(
          () =>
            pool.execute.command(
              SQL`INSERT INTO test_check (id, value) VALUES (1, -1)`,
            ),
          (error) => {
            assert.ok(error instanceof CheckViolationError);
            assert.ok(error instanceof IntegrityConstraintViolationError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: CheckViolationError.ErrorType,
              }),
            );
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_check`);
        await pool.close();
      }
    });
  });

  void describe('syntax and access errors', () => {
    void it('maps syntax error to InvalidOperationError', async () => {
      const pool = pgPool({ connectionString });
      try {
        await assert.rejects(
          () => pool.execute.command(SQL`SELEC 1`),
          (error) => {
            assert.ok(error instanceof InvalidOperationError);
            assert.ok(error instanceof DumboError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: InvalidOperationError.ErrorType,
              }),
            );
            return true;
          },
        );
      } finally {
        await pool.close();
      }
    });

    void it('maps undefined table to InvalidOperationError', async () => {
      const pool = pgPool({ connectionString });
      try {
        await assert.rejects(
          () =>
            pool.execute.query(
              SQL`SELECT * FROM table_that_does_not_exist_at_all`,
            ),
          (error) => {
            assert.ok(error instanceof InvalidOperationError);
            return true;
          },
        );
      } finally {
        await pool.close();
      }
    });
  });

  void describe('data exceptions', () => {
    void it('maps data exception to DataError', async () => {
      const pool = pgPool({ connectionString });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_data (id INT PRIMARY KEY, value INT)`,
        );

        await assert.rejects(
          () =>
            pool.execute.command(
              SQL`INSERT INTO test_data (id, value) VALUES (1, ${'not_a_number'})`,
            ),
          (error) => {
            assert.ok(error instanceof DataError);
            assert.ok(error instanceof DumboError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorType: DataError.ErrorType,
              }),
            );
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_data`);
        await pool.close();
      }
    });
  });

  void describe('transient errors', () => {
    void it('maps query cancellation to TransientDatabaseError', async () => {
      const pool = pgPool({ connectionString });
      try {
        await assert.rejects(
          () => pool.execute.query(SQL`SELECT pg_sleep(10)`, { timeoutMs: 1 }),
          (error) => {
            assert.ok(error instanceof TransientDatabaseError);
            assert.ok(error instanceof DumboError);
            assert.ok(
              DumboError.isInstanceOf(error, {
                errorCode: TransientDatabaseError.ErrorCode,
              }),
            );
            return true;
          },
        );
      } finally {
        await pool.close();
      }
    });
  });

  void describe('preserves inner error', () => {
    void it('wraps original pg error as innerError', async () => {
      const pool = pgPool({ connectionString });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_inner (id INT PRIMARY KEY)`,
        );
        await pool.execute.command(SQL`INSERT INTO test_inner (id) VALUES (1)`);

        await assert.rejects(
          () =>
            pool.execute.command(SQL`INSERT INTO test_inner (id) VALUES (1)`),
          (error) => {
            assert.ok(error instanceof DumboError);
            assert.ok(DumboError.isInstanceOf(error));
            assert.ok(error.innerError);
            assert.ok('code' in error.innerError);
            assert.strictEqual(
              (error.innerError as Error & { code: string }).code,
              '23505',
            );
            return true;
          },
        );
      } finally {
        await pool.execute.command(SQL`DROP TABLE IF EXISTS test_inner`);
        await pool.close();
      }
    });
  });
});
