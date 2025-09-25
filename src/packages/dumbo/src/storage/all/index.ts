import {
  type DatabaseDriverType,
  type DumboConnectionOptions,
} from '../../core';
import {
  storagePluginRegistry,
  type AnyDumboDatabaseDriver,
  type ExtractDumboTypeFromDriver,
} from '../../core/plugins';
import { parseConnectionString } from './connections';

export * from './connections';

storagePluginRegistry.register('PostgreSQL:pg', () =>
  import('../postgresql/pg').then((m) => m.databaseDriver),
);

storagePluginRegistry.register('SQLite:sqlite3', () =>
  import('../sqlite/sqlite3').then((m) => m.databaseDriver),
);

export function dumbo<
  DatabaseDriver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
>(
  options: DumboConnectionOptions<DatabaseDriver>,
): ExtractDumboTypeFromDriver<DatabaseDriver> {
  const { connectionString } = options;

  const { databaseType, driverName } = parseConnectionString(connectionString);

  const driverType = `${databaseType}:${driverName}` as DriverType;

  const driver = storagePluginRegistry.tryGet<DatabaseDriver>(driverType);

  if (driver === null) {
    throw new Error(`No plugin found for database driver type: ${driverType}`);
  }

  return driver.createPool({
    ...options,
    driverType,
  }) as ExtractDumboTypeFromDriver<DatabaseDriver>;
}
