import pgcs from 'pg-connection-string';
import { defaultPostgreSqlDatabase } from '../schema';

export const defaultPostgreSQLConenctionString =
  'postgresql://postgres@localhost:5432/postgres';

export const getDatabaseNameOrDefault = (connectionString: string) =>
  pgcs.parse(connectionString).database ?? defaultPostgreSqlDatabase;
