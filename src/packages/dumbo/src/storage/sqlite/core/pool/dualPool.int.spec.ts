import * as fs from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { SQL } from '../../../../core';
import { sqlite3Pool } from '../../sqlite3';

void describe('SQLite Dual Connection Pool', () => {
  const fileName = 'dual-pool-test.db';

  const cleanupDb = (file: string) => {
    try {
      fs.unlinkSync(file);
      fs.unlinkSync(`${file}-shm`);
      fs.unlinkSync(`${file}-wal`);
    } catch {
      // ignore
    }
  };

  before(() => {
    cleanupDb(fileName);
  });

  after(() => {
    cleanupDb(fileName);
  });

  void it('creates dual pool by default for file-based databases', async () => {
    const pool = sqlite3Pool({ fileName });

    try {
      await pool.execute.command(
        SQL`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`,
      );
      await pool.execute.command(SQL`INSERT INTO test (value) VALUES ('test')`);

      const result = await pool.execute.query(SQL`SELECT * FROM test`);
      if (result.rows.length !== 1 || result.rows[0]?.value !== 'test') {
        throw new Error('Dual pool query failed');
      }
    } finally {
      await pool.close();
    }
  });

  void it('uses singleton pool for in-memory databases', async () => {
    const pool = sqlite3Pool({ fileName: ':memory:' });

    try {
      await pool.execute.command(
        SQL`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`,
      );
      await pool.execute.command(
        SQL`INSERT INTO test (value) VALUES ('memory-test')`,
      );

      const result = await pool.execute.query(SQL`SELECT * FROM test`);
      if (result.rows.length !== 1 || result.rows[0]?.value !== 'memory-test') {
        throw new Error('In-memory pool query failed');
      }
    } finally {
      await pool.close();
    }
  });

  void it('allows explicit singleton pool for file-based databases', async () => {
    const singletonFileName = 'singleton-test.db';
    cleanupDb(singletonFileName);

    const pool = sqlite3Pool({ fileName: singletonFileName, singleton: true });

    try {
      await pool.execute.command(
        SQL`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`,
      );
      await pool.execute.command(
        SQL`INSERT INTO test (value) VALUES ('singleton')`,
      );

      const result = await pool.execute.query(SQL`SELECT * FROM test`);
      if (result.rows.length !== 1 || result.rows[0]?.value !== 'singleton') {
        throw new Error('Singleton pool query failed');
      }
    } finally {
      await pool.close();
      cleanupDb(singletonFileName);
    }
  });

  void it('handles concurrent reads during writes', async () => {
    const concurrentFileName = 'concurrent-test.db';
    cleanupDb(concurrentFileName);

    const pool = sqlite3Pool({ fileName: concurrentFileName });

    try {
      await pool.execute.command(
        SQL`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`,
      );

      for (let i = 0; i < 100; i++) {
        await pool.execute.command(
          SQL`INSERT INTO test (value) VALUES (${`value-${i}`})`,
        );
      }

      const writePromise = pool.execute.command(
        SQL`INSERT INTO test (value) SELECT value || '-copy' FROM test`,
      );

      const readPromises = Array.from({ length: 10 }, (_, i) =>
        pool.execute.query(
          SQL`SELECT COUNT(*) as count FROM test WHERE id > ${i * 10}`,
        ),
      );

      await Promise.all([writePromise, ...readPromises]);

      const finalCount = await pool.execute.query(
        SQL`SELECT COUNT(*) as count FROM test`,
      );
      if (!finalCount.rows[0] || finalCount.rows[0].count !== 200) {
        throw new Error(`Expected 200 rows, got ${finalCount.rows[0]?.count}`);
      }
    } finally {
      await pool.close();
      cleanupDb(concurrentFileName);
    }
  });

  void it('handles transactions with dual pool', async () => {
    const txFileName = 'transaction-test.db';
    cleanupDb(txFileName);

    const pool = sqlite3Pool({ fileName: txFileName });

    try {
      await pool.execute.command(
        SQL`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`,
      );

      await pool.withTransaction(async (tx) => {
        await tx.execute.command(SQL`INSERT INTO test (value) VALUES ('tx1')`);
        await tx.execute.command(SQL`INSERT INTO test (value) VALUES ('tx2')`);

        const result = await tx.execute.query(
          SQL`SELECT COUNT(*) as count FROM test`,
        );
        if (!result.rows[0] || result.rows[0].count !== 2) {
          throw new Error('Transaction query failed');
        }
      });

      const finalResult = await pool.execute.query(
        SQL`SELECT COUNT(*) as count FROM test`,
      );
      if (!finalResult.rows[0] || finalResult.rows[0].count !== 2) {
        throw new Error('Transaction commit failed');
      }
    } finally {
      await pool.close();
      cleanupDb(txFileName);
    }
  });

  void it('respects custom reader pool size', async () => {
    const customFileName = 'custom-pool-test.db';
    cleanupDb(customFileName);

    const pool = sqlite3Pool({
      fileName: customFileName,
      pooled: true,
      dual: true,
      readerPoolSize: 2,
    } as Parameters<typeof sqlite3Pool>[0]);

    try {
      await pool.execute.command(
        SQL`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)`,
      );
      await pool.execute.command(SQL`INSERT INTO test (value) VALUES ('test')`);

      const result = await pool.execute.query(SQL`SELECT * FROM test`);
      if (result.rows.length !== 1) {
        throw new Error('Custom pool size query failed');
      }
    } finally {
      await pool.close();
      cleanupDb(customFileName);
    }
  });

  void it('releases connections on query errors', async () => {
    const errorFileName = 'error-test.db';
    cleanupDb(errorFileName);

    const pool = sqlite3Pool({ fileName: errorFileName });

    try {
      await pool.execute.command(
        SQL`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`,
      );

      let errorCount = 0;
      const operations = Array.from({ length: 10 }, async () => {
        try {
          await pool.execute.command(
            SQL`INSERT INTO test (value) VALUES (NULL)`,
          );
        } catch {
          errorCount++;
        }
      });

      await Promise.all(operations);

      if (errorCount !== 10) {
        throw new Error(`Expected 10 errors, got ${errorCount}`);
      }

      const result = await pool.execute.query(
        SQL`SELECT COUNT(*) as count FROM test`,
      );
      if (!result.rows[0] || result.rows[0].count !== 0) {
        throw new Error('No rows should have been inserted');
      }
    } finally {
      await pool.close();
      cleanupDb(errorFileName);
    }
  });

  void it('releases connections on transaction rollback', async () => {
    const rollbackFileName = 'rollback-test.db';
    cleanupDb(rollbackFileName);

    const pool = sqlite3Pool({ fileName: rollbackFileName });

    try {
      await pool.execute.command(
        SQL`CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`,
      );

      let rollbackCount = 0;
      const operations = Array.from({ length: 5 }, async () => {
        try {
          await pool.withTransaction(async (tx) => {
            await tx.execute.command(
              SQL`INSERT INTO test (value) VALUES ('test')`,
            );
            await tx.execute.command(
              SQL`INSERT INTO test (value) VALUES (NULL)`,
            );
          });
        } catch {
          rollbackCount++;
        }
      });

      await Promise.all(operations);

      if (rollbackCount !== 5) {
        throw new Error(`Expected 5 rollbacks, got ${rollbackCount}`);
      }

      const result = await pool.execute.query(
        SQL`SELECT COUNT(*) as count FROM test`,
      );
      if (!result.rows[0] || result.rows[0].count !== 0) {
        throw new Error('No rows should have been committed');
      }
    } finally {
      await pool.close();
      cleanupDb(rollbackFileName);
    }
  });
});
