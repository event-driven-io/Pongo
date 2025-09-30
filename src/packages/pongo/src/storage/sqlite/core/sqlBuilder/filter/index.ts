import { SQL } from '@event-driven-io/dumbo';
import {
  hasOperators,
  objectEntries,
  QueryOperators,
  type PongoFilter,
} from '../../../../../core';
import { handleOperator } from './queryOperators';

export * from './queryOperators';

const AND = 'AND';

export const constructFilterQuery = <T>(filter: PongoFilter<T>): SQL =>
  SQL.merge(
    Object.entries(filter).map(([key, value]) =>
      isRecord(value)
        ? constructComplexFilterQuery(key, value)
        : handleOperator(key, '$eq', value),
    ),
    ` ${AND} `,
  );

const constructComplexFilterQuery = (
  key: string,
  value: Record<string, unknown>,
): SQL => {
  const isEquality = !hasOperators(value);

  return SQL.merge(
    objectEntries(value).map(([nestedKey, val]) =>
      isEquality
        ? handleOperator(`${key}.${nestedKey}`, QueryOperators.$eq, val)
        : handleOperator(key, nestedKey, val),
    ),
    ` ${AND} `,
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
