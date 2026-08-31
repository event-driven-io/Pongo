import { DumboError, JSONSerializer } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, expect, it } from 'vitest';
import { pongoDriverRegistry } from '../../../core';
import { cloudflareDurableObjectSQLiteDriver, pongoDriver } from './index';

const requiredFactoryOptions = {
  databaseName: 'requested',
  defaultSchemaName: 'public',
  serializer: JSONSerializer,
};

describe('Cloudflare Durable Object SQLite Pongo driver', () => {
  it('exposes the driver identity, Dumbo driver, and aliases', () => {
    expect(cloudflareDurableObjectSQLiteDriver.driverType).toBe(
      'SQLite:cloudflareDurableObjectSQLite',
    );
    expect(cloudflareDurableObjectSQLiteDriver.dumboDriver.driverType).toBe(
      'SQLite:cloudflareDurableObjectSQLite',
    );
    expect(pongoDriver).toBe(cloudflareDurableObjectSQLiteDriver);
  });

  it('registers the driver on import', () => {
    expect(
      pongoDriverRegistry.tryGet('SQLite:cloudflareDurableObjectSQLite'),
    ).toBe(cloudflareDurableObjectSQLiteDriver);
  });

  it('rejects missing storage, connection, and pool options at runtime', () => {
    const registeredDriver = pongoDriverRegistry.tryGet(
      'SQLite:cloudflareDurableObjectSQLite',
    );
    assert.ok(registeredDriver);

    assert.throws(
      () => registeredDriver.databaseFactory(requiredFactoryOptions),
      (error: unknown) => {
        assert.ok(DumboError.isInstanceOf(error));
        assert.strictEqual(error.errorType, 'PongoError');
        assert.strictEqual(error.errorCode, 500);
        assert.strictEqual(
          error.message,
          'Exactly one Durable Object SQLite storage, connection, or pool is required',
        );
        return true;
      },
    );
  });
});
