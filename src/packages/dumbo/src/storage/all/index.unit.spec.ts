import { describe, it } from 'vitest';
import { assertThrowsDumboError } from '../../core/errors/errorAssertions';
import { dumbo } from './index';

describe('resolving a database driver', () => {
  it('throws a NotRegisteredError when no plugin is registered for the driver type', () => {
    assertThrowsDumboError(
      () =>
        dumbo({
          driverType: 'Unregistered:driver',
          connectionString: 'unregistered://localhost',
        }),
      {
        errorType: 'NotRegisteredError',
        errorCode: 500,
        message: 'No plugin found for driver type: Unregistered:driver',
      },
    );
  });
});
