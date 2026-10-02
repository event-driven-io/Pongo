import { randomUUID } from 'crypto';
import pg from 'pg';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    sharedPostgreSQLConnectionString: string;
  }
}

export type SharedPostgreSQLDatabase = {
  connectionString: string;
  databaseName: string;
  close: () => Promise<void>;
};

const withDatabaseName = (
  serverConnectionString: string,
  databaseName: string,
): string => {
  const url = new URL(serverConnectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
};

const onServer = async <Result>(
  handle: (client: pg.Client) => Promise<Result>,
): Promise<Result> => {
  const client = new pg.Client({
    connectionString: inject('sharedPostgreSQLConnectionString'),
  });
  await client.connect();

  try {
    return await handle(client);
  } finally {
    await client.end();
  }
};

/**
 * Gives the caller its own database on the container shared by the whole
 * run. Creating a database costs milliseconds; starting a container costs
 * seconds, and starting one per file starts a dozen at once.
 *
 * Close every connection before calling `close`: the drop fails while the
 * database is still in use, which points at the spec that leaked it.
 */
export const sharedPostgreSQLDatabase =
  async (): Promise<SharedPostgreSQLDatabase> => {
    const databaseName = `test_${randomUUID().replaceAll('-', '')}`;

    await onServer((client) =>
      client.query(`CREATE DATABASE "${databaseName}"`),
    );

    return {
      connectionString: withDatabaseName(
        inject('sharedPostgreSQLConnectionString'),
        databaseName,
      ),
      databaseName,
      close: async () => {
        await onServer((client) =>
          client.query(`DROP DATABASE IF EXISTS "${databaseName}"`),
        );
      },
    };
  };
