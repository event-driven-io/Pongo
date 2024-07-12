import pgcs from 'pg-connection-string';

export const defaultPostgreSqlDatabase = 'postgres';

export const getDatabaseNameOrDefault = (connectionString: string) =>
  pgcs.parse(connectionString).database ?? defaultPostgreSqlDatabase;
