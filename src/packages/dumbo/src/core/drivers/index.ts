export type DatabaseType = string;
export type DatabaseDriverName = string;

export type DatabaseDriverType<
  DatabaseTypeName extends DatabaseType = DatabaseType,
  DriverName extends DatabaseDriverName = DatabaseDriverName,
> = `${DatabaseTypeName}:${DriverName}`;

export type InferDriverDatabaseType<T extends string> =
  T extends `${infer DatabaseType}:${string}` ? DatabaseType : never;

export type DatabaseDriverTypeParts<T extends DatabaseType = DatabaseType> = {
  databaseType: T;
  driverName: string;
};

/**
 * Accepts a `databaseType` (e.g. PostgreSQL, SQLite) and a `driverName`
 * (the library name, e.g. pg, sqlite3) and combines them to a singular
 * `databaseDriverType` which can be used in database handling.
 */
export function toDatabaseDriverType<T extends DatabaseType>(
  databaseType: T,
  driverName: string,
): DatabaseDriverType<T> {
  return `${databaseType}:${driverName}`;
}

/**
 * Accepts a fully formatted `driverType` and returns the broken down
 * `databaseType` and `driverName`.
 */
export function fromDatabaseDriverType<T extends DatabaseType>(
  databaseDriverType: DatabaseDriverType<T>,
): DatabaseDriverTypeParts<T> {
  const parts = databaseDriverType.split(':') as [T, string];
  return {
    databaseType: parts[0],
    driverName: parts[1],
  };
}

/**
 * Accepts a fully formatted `databaseDriverType` and returns the `driverName`.
 */
export function getDatabaseDriverName<T extends DatabaseType>(
  databaseDriverType: DatabaseDriverType<T>,
): DatabaseDriverName {
  const { driverName } = fromDatabaseDriverType(databaseDriverType);
  return driverName;
}

/**
 * Accepts a fully formatted `databaseDriverType` and returns the `databaseType`.
 */
export function getDatabaseType<T extends DatabaseType>(
  databaseDriverType: DatabaseDriverType<T>,
): DatabaseType {
  const { databaseType } = fromDatabaseDriverType(databaseDriverType);
  return databaseType;
}
