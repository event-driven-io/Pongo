import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'assert';
import { aroundEach, describe, it } from 'vitest';
import {
  cloudflareDurableObjectSQLiteDumboDriver,
  CloudflareDurableObjectSQLiteDriverType,
  type CloudflareDurableObjectSQLiteDumboOptions,
} from '../../../cloudflare';
import { DumboDatabaseDriverRegistry } from '../../../core';
import { dumbo, SQL } from '../../../index';

describe('Cloudflare Durable Object SQLite Dumbo driver', () => {
  describe('with Durable Object storage', () => {
    let storage: DurableObjectStorage;

    aroundEach(async (runTest) => {
      const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

      await runInDurableObject(stub, async (_instance, state) => {
        storage = state.storage;
        await runTest();
      });
    });

    it('creates a pool through the registered public driver', async () => {
      const options: CloudflareDurableObjectSQLiteDumboOptions = {
        driverType: CloudflareDurableObjectSQLiteDriverType,
        storage,
      };
      const pool = dumbo(options);

      try {
        const result = await pool.execute.query<{ value: number }>(
          SQL`SELECT ${42} AS value`,
        );

        assert.strictEqual(result.rowCount, 1);
        assert.deepStrictEqual(result.rows, [{ value: 42 }]);
      } finally {
        await pool.close();
      }
    });
  });

  it('does not handle options for a different driver', () => {
    const registry = DumboDatabaseDriverRegistry();
    registry.register(
      CloudflareDurableObjectSQLiteDriverType,
      cloudflareDurableObjectSQLiteDumboDriver,
    );
    const registeredDriver = registry.tryGet({
      driverType: CloudflareDurableObjectSQLiteDriverType,
    });
    assert.ok(registeredDriver);

    const canHandle = registeredDriver.canHandle({
      driverType: 'SQLite:d1',
    });

    assert.strictEqual(canHandle, false);
    assert.strictEqual(registry.tryGet({ driverType: 'SQLite:d1' }), null);
  });

  it('does not select the driver without a Durable Object source', () => {
    const registry = DumboDatabaseDriverRegistry();
    registry.register(
      CloudflareDurableObjectSQLiteDriverType,
      cloudflareDurableObjectSQLiteDumboDriver,
    );
    const registeredDriver = registry.tryGet({
      driverType: CloudflareDurableObjectSQLiteDriverType,
    });
    assert.ok(registeredDriver);

    const canHandle = registeredDriver.canHandle({});

    assert.strictEqual(canHandle, false);
    assert.strictEqual(registry.tryGet({}), null);
  });
});
