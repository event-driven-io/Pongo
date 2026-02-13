import type { JSONSerializer } from '../../../../core';
import {
  sqlExecutor,
  type AnyConnection,
  type DatabaseTransaction,
  type DatabaseTransactionOptions,
} from '../../../../core';
import { pgSQLExecutor } from '../execute';
import {
  PgDriverType,
  type PgConnection,
  type PgPoolOrClient,
} from './connection';

export type PgTransaction = DatabaseTransaction<PgConnection>;

export type PgIsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export type PgTransactionOptions = DatabaseTransactionOptions & {
  isolationLevel?: PgIsolationLevel;
};

export const pgTransaction =
  <ConnectionType extends AnyConnection = AnyConnection>(
    connection: () => ConnectionType,
    serializer: JSONSerializer,
  ) =>
  <DbClient extends PgPoolOrClient = PgPoolOrClient>(
    getClient: Promise<DbClient>,
    options?: {
      close: (client: DbClient, error?: unknown) => Promise<void>;
    } & PgTransactionOptions,
  ): DatabaseTransaction<ConnectionType> => ({
    connection: connection(),
    driverType: PgDriverType,
    begin: async () => {
      const client = await getClient;
      const parts = ['BEGIN'];
      if (options?.isolationLevel) {
        parts.push(`ISOLATION LEVEL ${options.isolationLevel}`);
      }
      if (options?.readonly) {
        parts.push('READ ONLY');
      }
      await client.query(parts.join(' '));
    },
    commit: async () => {
      const client = await getClient;

      try {
        await client.query('COMMIT');
      } finally {
        if (options?.close) await options?.close(client);
      }
    },
    rollback: async (error?: unknown) => {
      const client = await getClient;
      try {
        await client.query('ROLLBACK');
      } finally {
        if (options?.close) await options?.close(client, error);
      }
    },
    execute: sqlExecutor(pgSQLExecutor({ serializer }), {
      connect: () => getClient,
    }),
  });
