import type { ConnectorType, MigrationStyle } from '@event-driven-io/dumbo';
import type { PongoCollectionSchema, PongoDbSchema } from '../schema';
import type { AnyPongoDb } from '../typing';

export interface PongoDatabaseDriverOptions<ConnectionOptions = unknown> {
  connectionOptions?: ConnectionOptions | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPongoDatabaseDriverOptions = PongoDatabaseDriverOptions<any>;

export type PongoDatabaseFactoryOptions<
  CollectionsSchema extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
> = {
  databaseName?: string | undefined;
  connectionString: string;
  schema?:
    | {
        autoMigration?: MigrationStyle;
        definition?: PongoDbSchema<CollectionsSchema>;
      }
    | undefined;
  errors?: { throwOnOperationFailures?: boolean } | undefined;
};

export interface PongoDatabaseDriver<
  Database extends AnyPongoDb = AnyPongoDb,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DriverOptions extends
    AnyPongoDatabaseDriverOptions = AnyPongoDatabaseDriverOptions,
> {
  connector: Database['connector'];
  databaseFactory<
    CollectionsSchema extends Record<string, PongoCollectionSchema> = Record<
      string,
      PongoCollectionSchema
    >,
  >(
    options: PongoDatabaseFactoryOptions<CollectionsSchema>,
  ): Database;
  getDatabaseNameOrDefault(connectionString: string): string;
}

export type AnyPongoDatabaseDriver = PongoDatabaseDriver<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

export type ExtractDatabaseDriverOptions<DatabaseDriver> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseDriver extends PongoDatabaseDriver<any, infer O> ? O : never;

export type ExtractDatabaseTypeFromDriver<DatabaseDriver> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseDriver extends PongoDatabaseDriver<infer D, any> ? D : never;

export const PongoDatabaseDriverRegistry = () => {
  const drivers = new Map<
    ConnectorType,
    PongoDatabaseDriver | (() => Promise<PongoDatabaseDriver>)
  >();

  const register = <Database extends AnyPongoDb = AnyPongoDb>(
    connector: Database['connector'],
    driver:
      | PongoDatabaseDriver<Database>
      | (() => Promise<PongoDatabaseDriver<Database>>),
  ): void => {
    const entry = drivers.get(connector);
    if (
      entry &&
      (typeof entry !== 'function' || typeof driver !== 'function')
    ) {
      return;
    }
    drivers.set(connector, driver);
  };

  const tryResolve = async <
    Driver extends AnyPongoDatabaseDriver = AnyPongoDatabaseDriver,
  >(
    connector: Driver['connector'],
  ): Promise<Driver | null> => {
    const entry = drivers.get(connector);

    if (!entry) return null;

    if (typeof entry !== 'function') return entry as Driver;

    const driver = await entry();

    register(connector, driver);
    return driver as Driver;
  };

  const tryGet = <
    Driver extends AnyPongoDatabaseDriver = AnyPongoDatabaseDriver,
  >(
    connector: Driver['connector'],
  ): Driver | null => {
    const entry = drivers.get(connector);
    return typeof entry !== 'function' ? (entry as Driver) : null;
  };

  const has = (connector: ConnectorType): boolean => drivers.has(connector);

  return {
    register,
    tryResolve,
    tryGet,
    has,
    get connectorTypes(): ConnectorType[] {
      return Array.from(drivers.keys());
    },
  };
};

declare global {
  // eslint-disable-next-line no-var
  var pongoDatabaseDriverRegistry: ReturnType<
    typeof PongoDatabaseDriverRegistry
  >;
}

export const pongoDatabaseDriverRegistry =
  (globalThis.pongoDatabaseDriverRegistry =
    globalThis.pongoDatabaseDriverRegistry ?? PongoDatabaseDriverRegistry());
