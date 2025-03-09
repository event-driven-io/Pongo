import {
  postgresPool,
  type PostgresPool,
  type PostgresPoolOptions,
} from './storage/postgresql';

export * from './core';
export * from './storage/postgresql';

// TODO: Merge with ConnectorTypeName
export type SupportedConnector = `PostgreSQL:pg` | `SQLite:sqlite3`;

export type PoolOptions = {
  connector?: SupportedConnector;
};

export type DumboOptions = PoolOptions & PostgresPoolOptions;
export type Dumbo = PostgresPool;

export const connectionPool = <PoolOptionsType extends DumboOptions>(
  options: PoolOptionsType,
) =>
  // TODO: this should have the pattern matching and verification
  postgresPool(options as unknown as PostgresPoolOptions);

export const dumbo = <DumboOptionsType extends DumboOptions = DumboOptions>(
  options: DumboOptionsType,
): Dumbo => connectionPool(options);
