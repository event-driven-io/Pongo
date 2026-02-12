import assert from 'assert';
import { describe, it } from 'node:test';
import { parsePragmasFromConnectionString } from './connectionString';
import { DEFAULT_SQLITE_PRAGMA_OPTIONS } from './index';
import { buildPragmaStatements, mergePragmaOptions } from './pragmas';

void describe('PRAGMA parsing', () => {
  void it('parses journal_mode from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?journal_mode=DELETE',
    );

    assert.strictEqual(pragmas.journal_mode, 'DELETE');
  });

  void it('parses synchronous from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?synchronous=FULL',
    );

    assert.strictEqual(pragmas.synchronous, 'FULL');
  });

  void it('parses cache_size from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?cache_size=-2000000',
    );

    assert.strictEqual(pragmas.cache_size, -2000000);
  });

  void it('parses foreign_keys=true from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?foreign_keys=true',
    );

    assert.strictEqual(pragmas.foreign_keys, true);
  });

  void it('parses foreign_keys=on from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?foreign_keys=on',
    );

    assert.strictEqual(pragmas.foreign_keys, true);
  });

  void it('parses foreign_keys=1 from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?foreign_keys=1',
    );

    assert.strictEqual(pragmas.foreign_keys, true);
  });

  void it('parses foreign_keys=false from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?foreign_keys=false',
    );

    assert.strictEqual(pragmas.foreign_keys, false);
  });

  void it('parses temp_store from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?temp_store=file',
    );

    assert.strictEqual(pragmas.temp_store, 'FILE');
  });

  void it('parses busy_timeout from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?busy_timeout=10000',
    );

    assert.strictEqual(pragmas.busy_timeout, 10000);
  });

  void it('parses multiple PRAGMAs from connection string', () => {
    const pragmas = parsePragmasFromConnectionString(
      'file:test.db?journal_mode=WAL&synchronous=NORMAL&cache_size=-1000000&foreign_keys=true&temp_store=memory&busy_timeout=5000',
    );

    assert.deepStrictEqual(pragmas, {
      journal_mode: 'WAL',
      synchronous: 'NORMAL',
      cache_size: -1000000,
      foreign_keys: true,
      temp_store: 'MEMORY',
      busy_timeout: 5000,
    });
  });

  void it('returns empty object for non-file URIs', () => {
    const pragmas = parsePragmasFromConnectionString(':memory:');

    assert.deepStrictEqual(pragmas, {});
  });

  void it('returns empty object for relative paths', () => {
    const pragmas = parsePragmasFromConnectionString('./test.db');

    assert.deepStrictEqual(pragmas, {});
  });

  void it('returns empty object for absolute paths', () => {
    const pragmas = parsePragmasFromConnectionString('/var/lib/test.db');

    assert.deepStrictEqual(pragmas, {});
  });

  void it('returns empty object for file URI without query params', () => {
    const pragmas = parsePragmasFromConnectionString('file:test.db');

    assert.deepStrictEqual(pragmas, {});
  });
});

void describe('PRAGMA merging', () => {
  void it('uses defaults when no overrides provided', () => {
    const merged = mergePragmaOptions('file:test.db');

    assert.deepStrictEqual(merged, DEFAULT_SQLITE_PRAGMA_OPTIONS);
  });

  void it('connection string overrides defaults', () => {
    const merged = mergePragmaOptions(
      'file:test.db?synchronous=FULL&foreign_keys=false',
    );

    assert.strictEqual(merged.synchronous, 'FULL');
    assert.strictEqual(merged.foreign_keys, false);
    assert.strictEqual(merged.journal_mode, 'WAL');
    assert.strictEqual(merged.cache_size, -1000000);
  });

  void it('user options override connection string', () => {
    const merged = mergePragmaOptions(
      'file:test.db?synchronous=FULL&foreign_keys=false',
      { synchronous: 'NORMAL', busy_timeout: 10000 },
    );

    assert.strictEqual(merged.synchronous, 'NORMAL');
    assert.strictEqual(merged.foreign_keys, false);
    assert.strictEqual(merged.busy_timeout, 10000);
  });

  void it('follows precedence: defaults < connection string < user options', () => {
    const merged = mergePragmaOptions('file:test.db?cache_size=-500000', {
      cache_size: -2000000,
    });

    assert.strictEqual(merged.cache_size, -2000000);
  });
});

void describe('PRAGMA statement building', () => {
  void it('builds statements from default options', () => {
    const statements = buildPragmaStatements(DEFAULT_SQLITE_PRAGMA_OPTIONS);

    assert.deepStrictEqual(statements, [
      { pragma: 'journal_mode', value: 'WAL' },
      { pragma: 'synchronous', value: 'NORMAL' },
      { pragma: 'cache_size', value: -1000000 },
      { pragma: 'foreign_keys', value: 'ON' },
      { pragma: 'temp_store', value: 'MEMORY' },
      { pragma: 'busy_timeout', value: 5000 },
    ]);
  });

  void it('converts foreign_keys boolean to ON/OFF', () => {
    const statementsOn = buildPragmaStatements({
      ...DEFAULT_SQLITE_PRAGMA_OPTIONS,
      foreign_keys: true,
    });

    assert.strictEqual(
      statementsOn.find((s) => s.pragma === 'foreign_keys')?.value,
      'ON',
    );

    const statementsOff = buildPragmaStatements({
      ...DEFAULT_SQLITE_PRAGMA_OPTIONS,
      foreign_keys: false,
    });

    assert.strictEqual(
      statementsOff.find((s) => s.pragma === 'foreign_keys')?.value,
      'OFF',
    );
  });

  void it('builds statements with custom values', () => {
    const statements = buildPragmaStatements({
      journal_mode: 'DELETE',
      synchronous: 'FULL',
      cache_size: -2000000,
      foreign_keys: false,
      temp_store: 'FILE',
      busy_timeout: 10000,
    });

    assert.deepStrictEqual(statements, [
      { pragma: 'journal_mode', value: 'DELETE' },
      { pragma: 'synchronous', value: 'FULL' },
      { pragma: 'cache_size', value: -2000000 },
      { pragma: 'foreign_keys', value: 'OFF' },
      { pragma: 'temp_store', value: 'FILE' },
      { pragma: 'busy_timeout', value: 10000 },
    ]);
  });
});
