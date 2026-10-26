import {
  dumboDatabaseDriverRegistry,
  fromDatabaseDriverType,
  type DatabaseDriverType,
  type DatabaseType,
} from '../../drivers';
import type { SQLExecutor, SQLQueryOptions } from '../../execute';

export interface DatabaseCapabilities<
  SupportsMultipleDatabases extends boolean,
  SupportsSchemas extends boolean,
  SupportsFunctions extends boolean,
  SupportsTransactions extends boolean,
> {
  readonly supportsMultipleDatabases: SupportsMultipleDatabases;
  readonly supportsSchemas: SupportsSchemas;
  readonly supportsFunctions: SupportsFunctions;
  readonly supportsTransactions: SupportsTransactions;
}

export type DatabaseMetadata<
  SupportsMultipleDatabases extends boolean = boolean,
  SupportsSchemas extends boolean = boolean,
  SupportsFunctions extends boolean = boolean,
  SupportsTransactions extends boolean = boolean,
> = {
  readonly databaseType: DatabaseType;
  readonly defaultDatabaseName: string;
  readonly capabilities: DatabaseCapabilities<
    SupportsMultipleDatabases,
    SupportsSchemas,
    SupportsFunctions,
    SupportsTransactions
  >;
  readonly tableExists: (
    pool: SQLExecutor,
    tableName: string,
    options?: { databaseSchemaName?: string | undefined } & SQLQueryOptions,
  ) => Promise<boolean>;
} & (SupportsMultipleDatabases extends true
  ? {
      readonly parseDatabaseName: (
        connectionString?: string,
      ) => string | undefined;
    }
  : {
      readonly parseDatabaseName?: never;
    }) &
  (SupportsFunctions extends true
    ? {
        readonly functionExists: (
          pool: SQLExecutor,
          functionName: string,
          options?: {
            databaseSchemaName?: string | undefined;
          } & SQLQueryOptions,
        ) => Promise<boolean>;
      }
    : {
        readonly functionExists?: (
          pool: SQLExecutor,
          functionName: string,
          options?: {
            databaseSchemaName?: string | undefined;
          } & SQLQueryOptions,
        ) => Promise<boolean>;
      });

export const DumboDatabaseMetadataRegistry = () => {
  const infos = new Map<
    DatabaseType,
    DatabaseMetadata | (() => Promise<DatabaseMetadata>)
  >();

  const register = (
    databaseType: DatabaseType,
    info: DatabaseMetadata | (() => Promise<DatabaseMetadata>),
  ): void => {
    const entry = infos.get(databaseType);
    if (entry && (typeof entry !== 'function' || typeof info === 'function')) {
      return;
    }
    infos.set(databaseType, info);
  };

  const tryResolve = async (
    databaseType: DatabaseType,
  ): Promise<DatabaseMetadata | null> => {
    const entry = infos.get(databaseType);

    if (!entry) return null;

    if (typeof entry !== 'function') return entry;

    const resolved = await entry();
    register(databaseType, resolved);
    return resolved;
  };

  const tryGet = (databaseType: DatabaseType): DatabaseMetadata | null => {
    const entry = infos.get(databaseType);
    return entry && typeof entry !== 'function' ? entry : null;
  };

  const has = (databaseType: DatabaseType): boolean => infos.has(databaseType);

  return {
    register,
    tryResolve,
    tryGet,
    has,
    get databaseTypes(): DatabaseType[] {
      return Array.from(infos.keys());
    },
  };
};

declare global {
  var dumboDatabaseMetadataRegistry: ReturnType<
    typeof DumboDatabaseMetadataRegistry
  >;
}

const globalDumboDatabaseMetadataRegistry = () =>
  (globalThis.dumboDatabaseMetadataRegistry =
    globalThis.dumboDatabaseMetadataRegistry ??
    DumboDatabaseMetadataRegistry());

export const dumboDatabaseMetadataRegistry: ReturnType<
  typeof DumboDatabaseMetadataRegistry
> = {
  register: (databaseType, info) =>
    globalDumboDatabaseMetadataRegistry().register(databaseType, info),
  tryResolve: (databaseType) =>
    globalDumboDatabaseMetadataRegistry().tryResolve(databaseType),
  tryGet: (databaseType) =>
    globalDumboDatabaseMetadataRegistry().tryGet(databaseType),
  has: (databaseType) =>
    globalDumboDatabaseMetadataRegistry().has(databaseType),
  get databaseTypes() {
    return globalDumboDatabaseMetadataRegistry().databaseTypes;
  },
};

export const getDatabaseMetadata = (
  driverType: DatabaseDriverType,
): DatabaseMetadata | null => {
  const driver = dumboDatabaseDriverRegistry.tryGet({ driverType });
  if (driver) return driver.databaseMetadata;

  const { databaseType } = fromDatabaseDriverType(driverType);
  return dumboDatabaseMetadataRegistry.tryGet(databaseType);
};

export const resolveDatabaseMetadata = async (
  driverType: DatabaseDriverType,
  driverOverride?: DatabaseMetadata,
): Promise<DatabaseMetadata | null> => {
  if (driverOverride) return driverOverride;
  const { databaseType } = fromDatabaseDriverType(driverType);
  return dumboDatabaseMetadataRegistry.tryResolve(databaseType);
};

export const getDefaultDatabase = (
  driverType: DatabaseDriverType,
): string | undefined => {
  const metadata = getDatabaseMetadata(driverType);
  return metadata?.defaultDatabaseName;
};

export const getDefaultDatabaseAsync = async (
  driverType: DatabaseDriverType,
): Promise<string | undefined> => {
  const metadata = await resolveDatabaseMetadata(driverType);
  return metadata?.defaultDatabaseName;
};
