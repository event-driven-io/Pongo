import {
  fromDatabaseDriverType,
  type DatabaseDriverType,
  type DatabaseType,
} from '../../drivers';
import type { SQLExecutor } from '../../execute';

export interface DatabaseCapabilities<
  SupportsMultipleDatabases extends boolean,
  SupportsSchemas extends boolean,
  SupportsFunctions extends boolean,
> {
  readonly supportsMultipleDatabases: SupportsMultipleDatabases;
  readonly supportsSchemas: SupportsSchemas;
  readonly supportsFunctions: SupportsFunctions;
}

export type DatabaseMetadata<
  SupportsMultipleDatabases extends boolean = boolean,
  SupportsSchemas extends boolean = boolean,
  SupportsFunctions extends boolean = boolean,
> = {
  readonly databaseType: DatabaseType;
  readonly capabilities: DatabaseCapabilities<
    SupportsMultipleDatabases,
    SupportsSchemas,
    SupportsFunctions
  >;
  readonly tableExists: (
    pool: SQLExecutor,
    tableName: string,
  ) => Promise<boolean>;
} & (SupportsMultipleDatabases extends true
  ? {
      readonly defaultDatabaseName: string;
      readonly parseDatabaseName: (
        connectionString?: string,
      ) => string | undefined;
    }
  : {
      readonly defaultDatabaseName?: never;
      readonly parseDatabaseName?: never;
    }) &
  (SupportsFunctions extends true
    ? {
        readonly functionExists: (
          pool: SQLExecutor,
          functionName: string,
        ) => Promise<boolean>;
      }
    : {
        readonly functionExists?: (
          pool: SQLExecutor,
          functionName: string,
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

export const dumboDatabaseMetadataRegistry =
  (globalThis.dumboDatabaseMetadataRegistry =
    globalThis.dumboDatabaseMetadataRegistry ??
    DumboDatabaseMetadataRegistry());

export const getDatabaseMetadata = (
  driverType: DatabaseDriverType,
): DatabaseMetadata | null => {
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
