import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import assert from 'assert';
import { aroundEach, describe, it } from 'vitest';
import {
  DumboDatabaseDriverRegistry,
  InvalidOperationError,
  JSONSerializer,
} from '../../../../core';
import {
  cloudflareDurableObjectSQLiteDumboDriver,
  CloudflareDurableObjectSQLiteDriverType,
} from '..';
import { cloudflareDurableObjectSQLiteClient } from '../connections';

describe('Cloudflare Durable Object SQLite singleton pool', () => {
  let storage: DurableObjectStorage;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      await runTest();
    });
  });

  it('rejects conflicting storage and client sources at runtime', async () => {
    const client = cloudflareDurableObjectSQLiteClient({
      storage,
      serializer: JSONSerializer,
    });
    const registry = DumboDatabaseDriverRegistry();
    registry.register(
      CloudflareDurableObjectSQLiteDriverType,
      cloudflareDurableObjectSQLiteDumboDriver,
    );
    const registeredDriver = registry.tryGet({
      driverType: CloudflareDurableObjectSQLiteDriverType,
    });
    assert.ok(registeredDriver);

    const pool = registeredDriver.createPool({ storage, client });

    try {
      await assert.rejects(
        () => pool.connection(),
        (error) => {
          assert.ok(error instanceof InvalidOperationError);
          assert.strictEqual(
            error.message,
            'Exactly one Cloudflare Durable Object SQLite storage, client, or connection is required',
          );
          return true;
        },
      );
    } finally {
      await pool.close();
    }
  });
});
