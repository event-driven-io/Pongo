import {
  dumboDatabaseDriverRegistry,
  type AnyDumboDatabaseDriver,
  type DumboConnectionOptions,
  type ExtractDumboTypeFromDriver,
} from '../../core';

export * from './connections';

export function dumbo<
  DatabaseDriver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
  ConnectionOptions extends
    DumboConnectionOptions<DatabaseDriver> = DumboConnectionOptions<DatabaseDriver>,
>(options: ConnectionOptions): ExtractDumboTypeFromDriver<DatabaseDriver> {
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
