import format from 'pg-format';
import type { PongoFilter } from '../../main';
import { handleOperator, hasOperators } from './queryOperators';

const AND = 'AND';

export const constructFilterQuery = <T>(filter: PongoFilter<T>): string =>
  Object.entries(filter)
    .map(([key, value]) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? constructComplexFilterQuery(key, value as Record<string, unknown>)
        : constructSimpleFilterQuery(key, value),
    )
    .join(` ${AND} `);

const constructSimpleFilterQuery = (key: string, value: unknown): string =>
  format(
    `(data @> %L::jsonb OR jsonb_path_exists(data, '$.%s[*] ? (@ == %s)'))`,
    JSON.stringify(buildNestedObject(key, value)),
    key,
    JSON.stringify(value),
  );

const constructComplexFilterQuery = (
  key: string,
  value: Record<string, unknown>,
): string =>
  hasOperators(value)
    ? Object.entries(value)
        .map(([operator, val]) => handleOperator(key, operator, val))
        .join(` ${AND} `)
    : Object.entries(value)
        .map(([nestedKey, nestedValue]) =>
          constructSimpleFilterQuery(`${key}.${nestedKey}`, nestedValue),
        )
        .join(` ${AND} `);

export const buildNestedObject = (
  path: string,
  value: unknown,
): Record<string, unknown> =>
  path
    .split('.')
    .reverse()
    .reduce((acc, key) => ({ [key]: acc }), value as Record<string, unknown>);
