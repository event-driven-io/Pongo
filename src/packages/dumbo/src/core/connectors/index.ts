export type DatabaseType = string;
export type DatabaseDriverName = string;

//TODO: Rename to ConnectorType
export type ConnectorTypeName<
  DatabaseTypeName extends DatabaseType = DatabaseType,
  DriverName extends DatabaseDriverName = DatabaseDriverName,
> = `${DatabaseTypeName}:${DriverName}`;

export type ConnectorTypeParts<T extends DatabaseType = DatabaseType> = {
  databaseType: T;
  driverName: string;
};

/**
 * Accepts a `databaseType` (e.g. PostgreSQL, SQLite) and a `driverName`
 * (the library name, e.g. pg, sqlite3) and combines them to a singular
 * `connectorType` which can be used in database handling.
 */
export function toConnectorType<T extends DatabaseType>(
  databaseType: T,
  driverName: string,
): ConnectorTypeName<T> {
  return `${databaseType}:${driverName}`;
}

/**
 * Accepts a fully formatted `connectorType` and returns the broken down
 * `databaseType` and `driverName`.
 */
export function fromConnectorType<T extends DatabaseType>(
  connectorType: ConnectorTypeName<T>,
): ConnectorTypeParts<T> {
  const parts = connectorType.split(':') as [T, string];
  return {
    databaseType: parts[0],
    driverName: parts[1],
  };
}

/**
 * Accepts a fully formatted `connectorType` and returns the `driverName`.
 */
export function getDriverName<T extends DatabaseType>(
  connectorType: ConnectorTypeName<T>,
): DatabaseDriverName {
  const { driverName } = fromConnectorType(connectorType);
  return driverName;
}
