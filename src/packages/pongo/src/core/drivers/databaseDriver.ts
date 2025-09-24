import type {
  DatabaseDriverType,
  MigrationStyle,
} from '@event-driven-io/dumbo';
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
  DriverOptions extends
    AnyPongoDatabaseDriverOptions = AnyPongoDatabaseDriverOptions,
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
} & DriverOptions;

export interface PongoDatabaseDriver<
  Database extends AnyPongoDb = AnyPongoDb,
  DriverOptions extends
    AnyPongoDatabaseDriverOptions = AnyPongoDatabaseDriverOptions,
> {
  driverType: Database['driverType'];
  databaseFactory<
    CollectionsSchema extends Record<string, PongoCollectionSchema> = Record<
      string,
      PongoCollectionSchema
    >,
  >(
    options: PongoDatabaseFactoryOptions<CollectionsSchema, DriverOptions>,
  ): Database;
  getDatabaseNameOrDefault(connectionString: string): string;
  defaultConnectionString: string;
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
    DatabaseDriverType,
    PongoDatabaseDriver | (() => Promise<PongoDatabaseDriver>)
  >();

  const register = <Database extends AnyPongoDb = AnyPongoDb>(
    driverType: Database['driverType'],
    driver:
      | PongoDatabaseDriver<Database>
      | (() => Promise<PongoDatabaseDriver<Database>>),
  ): void => {
    const entry = drivers.get(driverType);
    if (
      entry &&
      (typeof entry !== 'function' || typeof driver === 'function')
    ) {
      return;
    }
    drivers.set(driverType, driver);
  };

  const tryResolve = async <
    Driver extends AnyPongoDatabaseDriver = AnyPongoDatabaseDriver,
  >(
    driverType: Driver['driverType'],
  ): Promise<Driver | null> => {
    const entry = drivers.get(driverType);

    if (!entry) return null;

    if (typeof entry !== 'function') return entry as Driver;

    const driver = await entry();

    register(driverType, driver);
    return driver as Driver;
  };

  const tryGet = <
    Driver extends AnyPongoDatabaseDriver = AnyPongoDatabaseDriver,
  >(
    driverType: Driver['driverType'],
  ): Driver | null => {
    const entry = drivers.get(driverType);
    return entry && typeof entry !== 'function' ? (entry as Driver) : null;
  };

  const has = (driverType: DatabaseDriverType): boolean =>
    drivers.has(driverType);

  return {
    register,
    tryResolve,
    tryGet,
    has,
    get databaseDriverTypes(): DatabaseDriverType[] {
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
