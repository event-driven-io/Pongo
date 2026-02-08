import {
  fromDatabaseDriverType,
  type DatabaseDriverType,
  type DatabaseType,
} from '.';
import type { SQLExecutor } from '../execute';

export interface DatabaseCapabilities {
  readonly supportsSchemas: boolean;
  readonly supportsFunctions: boolean;
}

export interface DatabaseMetadata {
  readonly databaseType: DatabaseType;
  readonly defaultDatabase: string;
  readonly capabilities: DatabaseCapabilities;
  readonly tableExists: (
    pool: SQLExecutor,
    tableName: string,
  ) => Promise<boolean>;
  readonly functionExists?: (
    pool: SQLExecutor,
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
  return metadata?.defaultDatabase;
};

export const getDefaultDatabaseAsync = async (
  driverType: DatabaseDriverType,
): Promise<string | undefined> => {
  const metadata = await resolveDatabaseMetadata(driverType);
  return metadata?.defaultDatabase;
};
