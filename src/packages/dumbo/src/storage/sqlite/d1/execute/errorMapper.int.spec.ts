import type { D1Database } from '@cloudflare/workers-types';
import assert from 'assert';
import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  CheckViolationError,
  DumboError,
  ForeignKeyViolationError,
  IntegrityConstraintViolationError,
  InvalidOperationError,
  NotNullViolationError,
  SQL,
  UniqueConstraintError,
} from '../../../../core';
import { d1Pool } from '../pool';

void describe('D1 error mapping', () => {
  let mf: Miniflare;
  let database: D1Database;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db-id' },
    });
    database = await mf.getD1Database('DB');
  });

  afterEach(async () => {
    await mf.dispose();
  });

  void describe('integrity constraint violations', () => {
    void it('maps unique constraint violation to UniqueConstraintError', async () => {
      const pool = d1Pool({ database });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_unique (id INTEGER PRIMARY KEY, value TEXT)`,
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
      const pool = d1Pool({ database });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_notnull (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`,
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
      const pool = d1Pool({ database });
      try {
        // SQLite/D1 has foreign keys disabled by default
        await pool.execute.command(SQL`PRAGMA foreign_keys = ON`);
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_parent (id INTEGER PRIMARY KEY)`,
        );
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES test_parent(id))`,
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
      const pool = d1Pool({ database });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_check (id INTEGER PRIMARY KEY, value INTEGER CHECK (value > 0))`,
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
      const pool = d1Pool({ database });
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
      const pool = d1Pool({ database });
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

  void describe('preserves inner error', () => {
    void it('wraps original D1 error as innerError', async () => {
      const pool = d1Pool({ database });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_inner (id INTEGER PRIMARY KEY)`,
        );
        await pool.execute.command(SQL`INSERT INTO test_inner (id) VALUES (1)`);

        await assert.rejects(
          () =>
            pool.execute.command(SQL`INSERT INTO test_inner (id) VALUES (1)`),
          (error) => {
            assert.ok(error instanceof DumboError);
            assert.ok(DumboError.isInstanceOf(error));
            assert.ok(error.innerError);
            assert.ok(error.innerError instanceof Error);
            // D1 errors embed constraint info in the message
            assert.ok(
              error.innerError.message
                .toUpperCase()
                .includes('UNIQUE CONSTRAINT FAILED'),
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
