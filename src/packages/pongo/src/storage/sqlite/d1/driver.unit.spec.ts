import { DumboError, JSONSerializer } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, expect, it } from 'vitest';
import { d1Driver } from './index';

describe('D1 Pongo driver', () => {
  it('exposes the D1 driver identity and Dumbo driver', () => {
    expect(d1Driver.driverType).toBe('SQLite:d1');
    expect(d1Driver.dumboDriver.driverType).toBe('SQLite:d1');
  });

  it('rejects missing database and connection options', () => {
    assert.throws(
      () =>
        d1Driver.databaseFactory({
          databaseName: 'requested',
          defaultSchemaName: 'public',
          serializer: JSONSerializer,
        }),
      (error: unknown) => {
        assert.ok(DumboError.isInstanceOf(error));
        assert.strictEqual(error.errorType, 'PongoError');
        assert.strictEqual(error.errorCode, 500);
        assert.strictEqual(
          error.message,
          'D1 database or connection is required',
        );
        return true;
      },
    );
  });
});
