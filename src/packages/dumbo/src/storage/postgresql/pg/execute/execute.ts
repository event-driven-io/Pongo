import pg from 'pg';
import type { JSONSerializer } from '../../../../core';
import {
  BatchCommandNoChangesError,
  mapSQLQueryResult,
  tracer,
  type BatchSQLCommandOptions,
  type DbSQLExecutor,
  type QueryResult,
  type QueryResultRow,
  type SQL,
  type SQLQueryOptions,
} from '../../../../core';
import { pgFormatter } from '../../core';
import { mapPostgresError } from '../../core/errors/errorMapper';
import { PgDriverType, type PgClientOrPoolClient } from '../connections';

export const isPgNativePool = (
  poolOrClient: unknown,
): poolOrClient is pg.Pool => {
  return poolOrClient instanceof pg.Pool;
};

export const isPgClient = (poolOrClient: unknown): poolOrClient is pg.Client =>
  poolOrClient instanceof pg.Client;

export const isPgPoolClient = (
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
): poolOrClient is pg.PoolClient =>
  'release' in poolOrClient && typeof poolOrClient.release === 'function';

export const pgExecute = async <Result = void>(
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
  handle: (client: pg.PoolClient | pg.Client) => Promise<Result>,
) => {
  const client = isPgNativePool(poolOrClient)
    ? await poolOrClient.connect()
    : poolOrClient;

  try {
    return await handle(client);
  } finally {
    // release only if client wasn't injected externally
    if (isPgNativePool(poolOrClient) && isPgPoolClient(client))
      client.release();
  }
};

export const pgQueryStatements = async <
  Result extends QueryResultRow = QueryResultRow,
>(
  poolOrClient: pg.Pool | pg.PoolClient | pg.Client,
  statements: string[],
): Promise<pg.QueryResult<Result>[]> => {
  const result = (await poolOrClient.query<Result>(statements.join('; '))) as
    pg.QueryResult<Result> | pg.QueryResult<Result>[];

  return Array.isArray(result) ? result : [result];
};

export type PgSQLExecutor = DbSQLExecutor<PgDriverType, PgClientOrPoolClient>;

export const pgSQLExecutor = ({
  serializer,
}: {
  serializer: JSONSerializer;
}): PgSQLExecutor => ({
  driverType: PgDriverType,
  query: async <Result extends QueryResultRow = QueryResultRow>(
    client: PgClientOrPoolClient,
    sql: SQL,
    options: SQLQueryOptions | undefined,
  ) => {
    const results = await batchQuery<Result>(
      client,
      [sql],
      serializer,
      options,
    );
    return results[0]!;
  },
  batchQuery: <Result extends QueryResultRow = QueryResultRow>(
    client: PgClientOrPoolClient,
    sqls: SQL[],
    options: SQLQueryOptions | undefined,
  ) => batchQuery<Result>(client, sqls, serializer, options),
  command: async <Result extends QueryResultRow = QueryResultRow>(
    client: PgClientOrPoolClient,
    sql: SQL,
    options: BatchSQLCommandOptions | undefined,
  ) => {
    const results = await batchCommand<Result>(
      client,
      [sql],
      serializer,
      options,
    );
    return results[0]!;
  },
  batchCommand: <Result extends QueryResultRow = QueryResultRow>(
    client: PgClientOrPoolClient,
    sqls: SQL[],
    options: BatchSQLCommandOptions | undefined,
  ) => batchCommand<Result>(client, sqls, serializer, options),
  formatter: pgFormatter,
});

async function withStatementTimeout<Result>(
  client: PgClientOrPoolClient,
  timeoutMs: number | undefined,
  handle: () => Promise<Result>,
): Promise<Result> {
  if (!timeoutMs) return handle();

  const [shown] = await pgQueryStatements<{ statement_timeout: string }>(
    client,
    ['SHOW statement_timeout', `SET statement_timeout = ${timeoutMs}`],
  );
  const previousTimeout = shown!.rows[0]!.statement_timeout;

  try {
    return await handle();
  } finally {
    try {
      await client.query(`SELECT set_config('statement_timeout', $1, false)`, [
        previousTimeout,
      ]);
    } catch (error) {
      tracer.warn('db:sql:statement_timeout:restore:error', { error });
    }
  }
}

function batchQuery<Result extends QueryResultRow = QueryResultRow>(
  client: PgClientOrPoolClient,
  sqls: SQL[],
  serializer: JSONSerializer,
  options?: SQLQueryOptions,
): Promise<QueryResult<Result>[]> {
  return withStatementTimeout(client, options?.timeoutMs, () =>
    runBatchQuery<Result>(client, sqls, serializer, options),
  );
}

async function runBatchQuery<Result extends QueryResultRow = QueryResultRow>(
  client: PgClientOrPoolClient,
  sqls: SQL[],
  serializer: JSONSerializer,
  options?: SQLQueryOptions,
): Promise<QueryResult<Result>[]> {
  const results: QueryResult<Result>[] = Array<QueryResult<Result>>(
    sqls.length,
  );

  //TODO: make it smarter at some point
  for (let i = 0; i < sqls.length; i++) {
    const { query, params } = pgFormatter.format(sqls[i]!, { serializer });
    tracer.info('db:sql:query', {
      query,
      params,
      debugSQL: pgFormatter.describe(sqls[i]!, { serializer }),
    });
    try {
      let result =
        params.length > 0
          ? await client.query<Result>(query, params)
          : await client.query<Result>(query);

      if (options?.mapping) {
        result = {
          ...result,
          rows: result.rows.map((row) =>
            mapSQLQueryResult(row, options.mapping!),
          ),
        };
      }

      results[i] = { rowCount: result.rowCount, rows: result.rows };
    } catch (error) {
      tracer.error('db:sql:batch_query:execute:error', { error });
      throw mapPostgresError(error);
    }
  }

  return results;
}

function batchCommand<Result extends QueryResultRow = QueryResultRow>(
  client: PgClientOrPoolClient,
  sqls: SQL[],
  serializer: JSONSerializer,
  options?: BatchSQLCommandOptions,
): Promise<QueryResult<Result>[]> {
  return withStatementTimeout(client, options?.timeoutMs, () =>
    runBatchCommand<Result>(client, sqls, serializer, options),
  );
}

async function runBatchCommand<Result extends QueryResultRow = QueryResultRow>(
  client: PgClientOrPoolClient,
  sqls: SQL[],
  serializer: JSONSerializer,
  options?: BatchSQLCommandOptions,
): Promise<QueryResult<Result>[]> {
  const results: QueryResult<Result>[] = Array<QueryResult<Result>>(
    sqls.length,
  );

  //TODO: make it smarter at some point
  for (let i = 0; i < sqls.length; i++) {
    const { query, params } = pgFormatter.format(sqls[i]!, { serializer });
    tracer.info('db:sql:command', {
      query,
      params,
      debugSQL: pgFormatter.describe(sqls[i]!, { serializer }),
    });
    try {
      let result =
        params.length > 0
          ? await client.query<Result>(query, params)
          : await client.query<Result>(query);

      if (options?.mapping) {
        result = {
          ...result,
          rows: result.rows.map((row) =>
            mapSQLQueryResult(row, options.mapping!),
          ),
        };
      }

      results[i] = { rowCount: result.rowCount, rows: result.rows };

      if (options?.assertChanges && (results[i]!.rowCount ?? 0) === 0) {
        throw new BatchCommandNoChangesError(i);
      }
    } catch (error) {
      tracer.error('db:sql:batch_command:execute:error', { error });
      throw mapPostgresError(error);
    }
  }

  return results;
}
