import { JSONSerializer } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import { pgDriver } from './index';

describe('PostgreSQL Pongo driver resolution', () => {
  it('rejects an ambient pool connected to another database', () => {
    assert.throws(
      () =>
        pgDriver.databaseFactory({
          connectionString: 'postgresql://localhost/connected',
          connectionOptions: {
            pool: {
              options: { database: 'connected' },
            } as never,
          },
          databaseName: 'requested',
          defaultSchemaName: 'public',
          serializer: JSONSerializer,
        }),
      /ambient PostgreSQL connection is connected to database connected and cannot be used for requested/,
    );
  });

  it('rejects an ambient client connected to another database', () => {
    assert.throws(
      () =>
        pgDriver.databaseFactory({
          connectionString: 'postgresql://localhost/connected',
          connectionOptions: {
            client: {
              database: 'connected',
            } as never,
          },
          databaseName: 'requested',
          defaultSchemaName: 'public',
          serializer: JSONSerializer,
        }),
      /ambient PostgreSQL connection is connected to database connected and cannot be used for requested/,
    );
  });
});
