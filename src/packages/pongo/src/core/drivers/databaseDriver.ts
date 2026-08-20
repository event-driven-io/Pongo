import type {
  AnyDumboDatabaseDriver,
  DatabaseDriverType,
  DumboConnectionOptions,
  ExtractDumboTypeFromDriver,
  JSONSerializationOptions,
  JSONSerializer,
  MigrationTableOptions,
  MigrationStyle,
} from '@event-driven-io/dumbo';
import type { CacheConfig, PongoCache } from '../cache';
import type { PongoDbSchema } from '../schema';
import type { AnyPongoDb, PongoDb } from '../typing';

export type PongoDriverOptions<
  DumboDriver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
> = {
  connectionOptions?:
    | DistributiveOmit<
        DumboConnectionOptions<DumboDriver>,
        'driver' | 'driverType'
      >
    | undefined;
  pool?: ExtractDumboTypeFromDriver<DumboDriver> | undefined;
} & JSONSerializationOptions;

export type DistributiveOmit<
  Value,
  Keys extends PropertyKey,
> = Value extends unknown ? Omit<Value, Keys> : never;

export type AnyPongoDriverOptions = PongoDriverOptions<AnyDumboDatabaseDriver>;

export type PongoDatabaseFactoryOptions<
  Definition extends PongoDbSchema = PongoDbSchema,
  DriverOptions extends AnyPongoDriverOptions = AnyPongoDriverOptions,
> = {
  databaseName: string;
  defaultSchemaName?: string | undefined;
  migrationTable?: MigrationTableOptions | undefined;
  schema?:
    | {
        autoMigration?: MigrationStyle;
        definition?: Definition;
      }
    | undefined;
  serializer: JSONSerializer;
  errors?: { throwOnOperationFailures?: boolean } | undefined;
  cache?: CacheConfig | 'disabled' | PongoCache | undefined;
} & DriverOptions;

export interface PongoDriver<
  Database extends AnyPongoDb = AnyPongoDb,
  DumboDriver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
  DriverOptions extends PongoDriverOptions<DumboDriver> =
    PongoDriverOptions<DumboDriver>,
> {
  driverType: Database['driverType'];
  readonly dumboDriver: DumboDriver;
  databaseFactory<Definition extends PongoDbSchema = PongoDbSchema>(
    options: PongoDatabaseFactoryOptions<Definition, DriverOptions>,
  ): Database & PongoDb<Database['driverType']>;
}

export type AnyPongoDriver = PongoDriver<
  AnyPongoDb,
  AnyDumboDatabaseDriver,
  AnyPongoDriverOptions
>;

export type ExtractPongoDriverOptions<DatabaseDriver> =
  DatabaseDriver extends PongoDriver<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    infer O
  >
    ? O
    : never;

export type ExtractPongoDatabaseTypeFromDriver<DatabaseDriver> =
  DatabaseDriver extends PongoDriver<
    infer D,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
    ? D
    : never;

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
