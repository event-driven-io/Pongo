import type { ConnectionPool } from '../connections';
import {
  fromDatabaseDriverType,
  type DatabaseDriverType,
  type DatabaseType,
} from '.';

export interface DatabaseCapabilities {
  readonly supportsSchemas: boolean;
  readonly supportsFunctions: boolean;
}

export interface DatabaseMetadata {
  readonly databaseType: DatabaseType;
  readonly defaultDatabase: string;
  readonly capabilities: DatabaseCapabilities;
  readonly tableExists: (
    pool: ConnectionPool,
    tableName: string,
  ) => Promise<boolean>;
  readonly functionExists?: (
    pool: ConnectionPool,
    functionName: string,
  ) => Promise<boolean>;
  readonly parseDatabaseName?: (connectionString: string) => string | null;
  readonly getDatabaseNameOrDefault: (connectionString?: string) => string;
}

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

export const resolveDatabaseMetadata = (
  driverType: DatabaseDriverType,
  driverOverride?: DatabaseMetadata,
): DatabaseMetadata | null => {
  if (driverOverride) return driverOverride;
  const { databaseType } = fromDatabaseDriverType(driverType);
  return dumboDatabaseMetadataRegistry.tryGet(databaseType);
};

export const resolveDatabaseMetadataAsync = async (
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
  const metadata = resolveDatabaseMetadata(driverType);
  return metadata?.defaultDatabase;
};

export const getDefaultDatabaseAsync = async (
  driverType: DatabaseDriverType,
): Promise<string | undefined> => {
  const metadata = await resolveDatabaseMetadataAsync(driverType);
  return metadata?.defaultDatabase;
};
