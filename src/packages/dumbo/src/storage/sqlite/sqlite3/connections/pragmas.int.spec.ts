import assert from 'assert';
import fs from 'fs';
import { afterEach, describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { SQL } from '../../../../core';
import { sqlite3Pool } from '../../../../sqlite3';
import { InMemorySQLiteDatabase } from '../../core';

void describe('PRAGMA application in sqlite3', () => {
  const testDatabasePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  const fileName = path.resolve(testDatabasePath, 'test-pragmas.db');

  afterEach(() => {
    try {
      if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
      }
      if (fs.existsSync(`${fileName}-shm`)) {
        fs.unlinkSync(`${fileName}-shm`);
      }
      if (fs.existsSync(`${fileName}-wal`)) {
        fs.unlinkSync(`${fileName}-wal`);
      }
    } catch (error) {
      console.log('Error deleting file:', error);
    }
  });

  void it('applies default PRAGMA values on connection', async () => {
    const pool = sqlite3Pool({ fileName });

    try {
      const journalMode = await pool.execute.query<{ journal_mode: string }>(
        SQL`PRAGMA journal_mode;`,
      );
      assert.strictEqual(journalMode.rows[0]?.journal_mode, 'wal');

      const synchronous = await pool.execute.query<{ synchronous: number }>(
        SQL`PRAGMA synchronous;`,
      );
      assert.strictEqual(synchronous.rows[0]?.synchronous, 1);

      const foreignKeys = await pool.execute.query<{ foreign_keys: number }>(
        SQL`PRAGMA foreign_keys;`,
      );
      assert.strictEqual(foreignKeys.rows[0]?.foreign_keys, 1);

      const tempStore = await pool.execute.query<{ temp_store: number }>(
        SQL`PRAGMA temp_store;`,
      );
      assert.strictEqual(tempStore.rows[0]?.temp_store, 2);

      const busyTimeout = await pool.execute.query<{ timeout: number }>(
        SQL`PRAGMA busy_timeout;`,
      );
      assert.strictEqual(busyTimeout.rows[0]?.timeout, 5000);
    } finally {
      await pool.close();
    }
  });

  void it('applies PRAGMA values from connection string', async () => {
    const pool = sqlite3Pool({
      connectionString: `file:${fileName}?synchronous=FULL&foreign_keys=off`,
    });

    try {
      const synchronous = await pool.execute.query<{ synchronous: number }>(
        SQL`PRAGMA synchronous;`,
      );
      assert.strictEqual(synchronous.rows[0]?.synchronous, 2);

      const foreignKeys = await pool.execute.query<{ foreign_keys: number }>(
        SQL`PRAGMA foreign_keys;`,
      );
      assert.strictEqual(foreignKeys.rows[0]?.foreign_keys, 0);

      const journalMode = await pool.execute.query<{ journal_mode: string }>(
        SQL`PRAGMA journal_mode;`,
      );
      assert.strictEqual(journalMode.rows[0]?.journal_mode, 'wal');
    } finally {
      await pool.close();
    }
  });

  void it('applies PRAGMA values from code options', async () => {
    const pool = sqlite3Pool({
      fileName,
      pragmaOptions: {
        synchronous: 'FULL',
        cache_size: -2000000,
        busy_timeout: 10000,
      },
    });

    try {
      const synchronous = await pool.execute.query<{ synchronous: number }>(
        SQL`PRAGMA synchronous;`,
      );
      assert.strictEqual(synchronous.rows[0]?.synchronous, 2);

      const cacheSize = await pool.execute.query<{ cache_size: number }>(
        SQL`PRAGMA cache_size;`,
      );
      assert.strictEqual(cacheSize.rows[0]?.cache_size, -2000000);

      const busyTimeout = await pool.execute.query<{ timeout: number }>(
        SQL`PRAGMA busy_timeout;`,
      );
      assert.strictEqual(busyTimeout.rows[0]?.timeout, 10000);
    } finally {
      await pool.close();
    }
  });

  void it('code options override connection string', async () => {
    const pool = sqlite3Pool({
      connectionString: `file:${fileName}?synchronous=OFF`,
      pragmaOptions: {
        synchronous: 'FULL',
      },
    });

    try {
      const synchronous = await pool.execute.query<{ synchronous: number }>(
        SQL`PRAGMA synchronous;`,
      );
      assert.strictEqual(synchronous.rows[0]?.synchronous, 2);
    } finally {
      await pool.close();
    }
  });

  void it('applies PRAGMAs to in-memory database', async () => {
    const pool = sqlite3Pool({
      fileName: InMemorySQLiteDatabase,
      pragmaOptions: {
        foreign_keys: false,
      },
    });

    try {
      const foreignKeys = await pool.execute.query<{ foreign_keys: number }>(
        SQL`PRAGMA foreign_keys;`,
      );
      assert.strictEqual(foreignKeys.rows[0]?.foreign_keys, 0);

      const tempStore = await pool.execute.query<{ temp_store: number }>(
        SQL`PRAGMA temp_store;`,
      );
      assert.strictEqual(tempStore.rows[0]?.temp_store, 2);
    } finally {
      await pool.close();
    }
  });

  void it('WAL mode persists across connections', async () => {
    const pool1 = sqlite3Pool({ fileName });

    try {
      const journalMode1 = await pool1.execute.query<{ journal_mode: string }>(
        SQL`PRAGMA journal_mode;`,
      );
      assert.strictEqual(journalMode1.rows[0]?.journal_mode, 'wal');
    } finally {
      await pool1.close();
    }

    const pool2 = sqlite3Pool({ fileName });

    try {
      const journalMode2 = await pool2.execute.query<{ journal_mode: string }>(
        SQL`PRAGMA journal_mode;`,
      );
      assert.strictEqual(journalMode2.rows[0]?.journal_mode, 'wal');
    } finally {
      await pool2.close();
    }
  });

  void it('enforces foreign key constraints when enabled', async () => {
    const pool = sqlite3Pool({
      fileName,
      pragmaOptions: {
        foreign_keys: true,
      },
    });

    try {
      await pool.execute.command(SQL`
        CREATE TABLE parent (id INTEGER PRIMARY KEY);
      `);

      await pool.execute.command(SQL`
        CREATE TABLE child (
          id INTEGER PRIMARY KEY,
          parent_id INTEGER,
          FOREIGN KEY(parent_id) REFERENCES parent(id)
        );
      `);

      await assert.rejects(
        async () => {
          await pool.execute.command(SQL`
            INSERT INTO child (id, parent_id) VALUES (1, 999);
          `);
        },
        (error: Error) => {
          return error.message.includes('FOREIGN KEY constraint failed');
        },
      );
    } finally {
      await pool.close();
    }
  });

  void it('allows foreign key violations when disabled', async () => {
    const pool = sqlite3Pool({
      fileName,
      pragmaOptions: {
        foreign_keys: false,
      },
    });

    try {
      await pool.execute.command(SQL`
        CREATE TABLE parent (id INTEGER PRIMARY KEY);
      `);

      await pool.execute.command(SQL`
        CREATE TABLE child (
          id INTEGER PRIMARY KEY,
          parent_id INTEGER,
          FOREIGN KEY(parent_id) REFERENCES parent(id)
        );
      `);

      await pool.execute.command(SQL`
        INSERT INTO child (id, parent_id) VALUES (1, 999);
      `);

      const result = await pool.execute.query<{ id: number }>(
        SQL`SELECT id FROM child WHERE id = 1;`,
      );
      assert.strictEqual(result.rows[0]?.id, 1);
    } finally {
      await pool.close();
    }
  });
});
