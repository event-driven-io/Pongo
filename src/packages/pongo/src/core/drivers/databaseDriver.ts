import type {
  DatabaseDriverType,
  JSONSerializationOptions,
  JSONSerializer,
  MigrationStyle,
} from '@event-driven-io/dumbo';
import type { PongoCollectionSchema, PongoDbSchema } from '../schema';
import type { AnyPongoDb, PongoDb } from '../typing';

export type PongoDriverOptions<ConnectionOptions = unknown> = {
  connectionOptions?: ConnectionOptions | undefined;
} & JSONSerializationOptions;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPongoDriverOptions = PongoDriverOptions<any>;

export type PongoDatabaseFactoryOptions<
  CollectionsSchema extends Record<string, PongoCollectionSchema> = Record<
    string,
    PongoCollectionSchema
  >,
  DriverOptions extends AnyPongoDriverOptions = AnyPongoDriverOptions,
> = {
  databaseName?: string | undefined;
  schema?:
    | {
        autoMigration?: MigrationStyle;
        definition?: PongoDbSchema<CollectionsSchema>;
      }
    | undefined;
  serializer: JSONSerializer;
  errors?: { throwOnOperationFailures?: boolean } | undefined;
} & DriverOptions;

export interface PongoDriver<
  Database extends AnyPongoDb = AnyPongoDb,
  DriverOptions extends AnyPongoDriverOptions = AnyPongoDriverOptions,
> {
  driverType: Database['driverType'];
  databaseFactory<
    CollectionsSchema extends Record<string, PongoCollectionSchema> = Record<
      string,
      PongoCollectionSchema
    >,
  >(
    options: PongoDatabaseFactoryOptions<CollectionsSchema, DriverOptions>,
  ): Database & PongoDb<Database['driverType']>;
}

export type AnyPongoDriver = PongoDriver<AnyPongoDb, AnyPongoDriverOptions>;

export type ExtractPongoDriverOptions<DatabaseDriver> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseDriver extends PongoDriver<any, infer O> ? O : never;

export type ExtractPongoDatabaseTypeFromDriver<DatabaseDriver> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseDriver extends PongoDriver<infer D, any> ? D : never;

export const PongoDriverRegistry = () => {
  const drivers = new Map<
    DatabaseDriverType,
    PongoDriver | (() => Promise<PongoDriver>)
  >();

  const register = <Database extends AnyPongoDb = AnyPongoDb>(
    driverType: Database['driverType'],
    driver: PongoDriver<Database> | (() => Promise<PongoDriver<Database>>),
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

  const tryResolve = async <Driver extends AnyPongoDriver = AnyPongoDriver>(
    driverType: Driver['driverType'],
  ): Promise<Driver | null> => {
    const entry = drivers.get(driverType);

    if (!entry) return null;

    if (typeof entry !== 'function') return entry as Driver;

    const driver = await entry();

    register(driverType, driver);
    return driver as Driver;
  };

  const tryGet = <Driver extends AnyPongoDriver = AnyPongoDriver>(
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
  var pongoDriverRegistry: ReturnType<typeof PongoDriverRegistry>;
}

export const pongoDriverRegistry = (globalThis.pongoDriverRegistry =
  globalThis.pongoDriverRegistry ?? PongoDriverRegistry());
