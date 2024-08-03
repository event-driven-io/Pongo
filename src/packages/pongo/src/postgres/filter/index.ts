import type { PongoFilter } from '../../core';
import { entries } from '../../core/typing';
import { Operators, handleOperator, hasOperators } from './queryOperators';

export * from './queryOperators';

const AND = 'AND';

export const constructFilterQuery = <T>(filter: PongoFilter<T>): string =>
  Object.entries(filter)
    .map(([key, value]) =>
      isRecord(value)
        ? constructComplexFilterQuery(key, value)
        : handleOperator(key, '$eq', value),
    )
    .join(` ${AND} `);

const constructComplexFilterQuery = (
  key: string,
  value: Record<string, unknown>,
): string => {
  const isEquality = !hasOperators(value);

  return entries(value)
    .map(
      ([nestedKey, val]) =>
        isEquality
          ? handleOperator(`${key}.${nestedKey}`, Operators.$eq, val) // regular value
          : handleOperator(key, nestedKey, val), // operator
    )
    .join(` ${AND} `);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
