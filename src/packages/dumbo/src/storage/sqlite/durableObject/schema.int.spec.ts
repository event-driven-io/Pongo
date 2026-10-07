import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { aroundEach, describe } from 'vitest';
import { CloudflareDurableObjectSQLiteDriverType } from '../../../cloudflare';
import { dumbo, type Dumbo } from '../../../index';
import { sqliteSchemaObjectsTests } from '../sqliteSchemaObjectsTests';

describe('checking if Durable Object schema objects exist', () => {
  let pool: Dumbo;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      pool = dumbo({
        driverType: CloudflareDurableObjectSQLiteDriverType,
        storage: state.storage,
      });
      try {
        await runTest();
      } finally {
        await pool.close();
      }
    });
  });

  sqliteSchemaObjectsTests({ execute: () => pool.execute });
});
