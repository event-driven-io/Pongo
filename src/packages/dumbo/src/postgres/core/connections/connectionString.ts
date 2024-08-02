import pgcs from 'pg-connection-string';
import { defaultPostgreSqlDatabase } from '../schema';

export const getDatabaseNameOrDefault = (connectionString: string) =>
  pgcs.parse(connectionString).database ?? defaultPostgreSqlDatabase;
