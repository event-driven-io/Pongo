import { getDriverName } from '../../core';
import type { SQLiteClientFactory, SQLiteConnectorType } from './core';

export type SQLiteDatabaseType = 'SQLite';

export const sqliteClientProvider = async <
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  connector: ConnectorType,
): Promise<SQLiteClientFactory> => {
  const driverName = getDriverName(connector);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const driverModule = await import(`./${driverName.toLowerCase()}`);

  if (!('sqliteClient' in driverModule))
    throw new Error(
      `The connector module "${connector}" does not export a sqliteClient`,
    );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return driverModule.sqliteClient as SQLiteClientFactory;
};
