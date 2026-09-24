import {
  InvalidOperationError,
  single,
  SQL,
  tracer,
  type JSONSerializer,
} from '../../../../core';
import { pgFormatter } from '../../core';
import { mapPostgresError } from '../../core/errors/errorMapper';
import type { PgClientOrPoolClient } from '../connections';

export const statementTimeoutSQL = {
  set: (timeoutMS: number, scope: 'session' | 'transaction') => {
    if (!Number.isInteger(timeoutMS) || timeoutMS < 1 || timeoutMS > 2147483647)
      throw new InvalidOperationError(
        `statement timeout must be an integer between 1 and 2147483647 ms, got ${timeoutMS}`,
      );

    return SQL`SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', ${SQL.literal(String(timeoutMS))}, ${SQL.plain(String(scope === 'transaction'))})`;
  },
  restore: (previousTimeout: string) =>
    SQL`SELECT set_config('statement_timeout', ${SQL.literal(previousTimeout)}, false)`,
};

export const setStatementTimeout = async (
  client: PgClientOrPoolClient,
  timeoutMS: number,
  serializer: JSONSerializer,
): Promise<string> => {
  const { query } = pgFormatter.format(
    statementTimeoutSQL.set(timeoutMS, 'session'),
    { serializer },
  );
  try {
    const { statement_timeout } = await single(
      client.query<{ statement_timeout: string }>(query),
    );
    return statement_timeout;
  } catch (error) {
    tracer.error('db:sql:statement_timeout:set:error', { error });
    throw mapPostgresError(error);
  }
};

export const restoreStatementTimeout = async (
  client: PgClientOrPoolClient,
  previousTimeout: string,
  serializer: JSONSerializer,
): Promise<void> => {
  const { query } = pgFormatter.format(
    statementTimeoutSQL.restore(previousTimeout),
    { serializer },
  );
  await client
    .query(query)
    .catch((error: unknown) =>
      tracer.warn('db:sql:statement_timeout:restore:error', { error }),
    );
};
