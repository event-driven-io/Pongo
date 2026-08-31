import { describe, it } from 'vitest';
import { DumboDatabaseDriverRegistry } from '../../../../core';
import { assertRejectsDumboError } from '../../../../core/errors/errorAssertions';
import {
  cloudflareDurableObjectSQLiteDumboDriver,
  CloudflareDurableObjectSQLiteDriverType,
} from '..';

describe('Cloudflare Durable Object SQLite singleton pool', () => {
  it('reports missing storage, client, and connection as an InvalidOperationError', async () => {
    const registry = DumboDatabaseDriverRegistry();
    registry.register(
      CloudflareDurableObjectSQLiteDriverType,
      cloudflareDurableObjectSQLiteDumboDriver,
    );
    const registeredDriver = registry.tryGet({
      driverType: CloudflareDurableObjectSQLiteDriverType,
    });
    if (!registeredDriver) throw new Error('Driver was not registered');

    const pool = registeredDriver.createPool({});

    await assertRejectsDumboError(() => pool.connection(), {
      errorType: 'InvalidOperationError',
      errorCode: 400,
      message:
        'Exactly one Cloudflare Durable Object SQLite storage, client, or connection is required',
    });
  });
});
