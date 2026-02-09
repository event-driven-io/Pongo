import {
  dumboDatabaseDriverRegistry,
  type AnyDumboDatabaseDriver,
  type DumboConnectionOptions,
  type ExtractDumboDatabaseDriverOptions,
  type ExtractDumboTypeFromDriver,
  type JSONSerializationOptions,
} from '../../core';

export * from './connections';

export function dumbo<Driver extends AnyDumboDatabaseDriver>(
  options: ExtractDumboDatabaseDriverOptions<Driver> & {
    driver: Driver;
  } & JSONSerializationOptions,
): ExtractDumboTypeFromDriver<Driver>;

export function dumbo<
  DatabaseDriver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
  ConnectionOptions extends DumboConnectionOptions<DatabaseDriver> =
    DumboConnectionOptions<DatabaseDriver>,
>(
  options: ConnectionOptions & { driver?: never },
): ExtractDumboTypeFromDriver<DatabaseDriver>;

export function dumbo<
  DatabaseDriver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
>(
  options: DumboConnectionOptions<DatabaseDriver>,
): ExtractDumboTypeFromDriver<DatabaseDriver> {
  const { driverType } = options;

  const driver =
    options.driver ??
    dumboDatabaseDriverRegistry.tryGet<DatabaseDriver>(options);

  if (driver === null) {
    throw new Error(`No plugin found for driver type: ${driverType}`);
  }

  return driver.createPool({
    ...options,
    driverType: driver.driverType,
  }) as ExtractDumboTypeFromDriver<DatabaseDriver>;
}

import '../postgresql/core/schema/postgreSQLMetadata';
import '../sqlite/core/schema/sqliteMetadata';
