import { DumboError, JSONSerializer } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, expect, it } from 'vitest';
import { d1Driver } from './index';

describe('D1 Pongo driver', () => {
  it('exposes the D1 driver identity and Dumbo driver', () => {
    expect(d1Driver.driverType).toBe('SQLite:d1');
    expect(d1Driver.dumboDriver.driverType).toBe('SQLite:d1');
  });

  it('creates the database without a D1 binding', () => {
    assert.doesNotThrow(() =>
      d1Driver.databaseFactory({
        databaseName: 'requested',
        defaultSchemaName: 'public',
        serializer: JSONSerializer,
      }),
    );
  });

  it('rejects the first operation when no D1 binding was provided', async () => {
    const db = d1Driver.databaseFactory({
      databaseName: 'requested',
      defaultSchemaName: 'public',
      serializer: JSONSerializer,
      schema: { autoMigration: 'None' },
    });

    await assert.rejects(
      () => db.collection('users').findOne(),
      (error: unknown) => {
        assert.ok(DumboError.isInstanceOf(error));
        assert.strictEqual(error.errorType, 'InvalidOperationError');
        assert.strictEqual(error.errorCode, 400);
        assert.strictEqual(
          error.message,
          'D1 database or connection is required',
        );
        return true;
      },
    );
  });
});
