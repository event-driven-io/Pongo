import format from 'pg-format';
import type { PongoFilter } from '../../main';

const operatorMap = {
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
  $ne: '!=',
};

export const constructFilterQuery = <T>(filter: PongoFilter<T>): string => {
  const filters = Object.entries(filter).map(([key, value]) => {
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      return constructComplexFilterQuery(key, value as Record<string, unknown>);
    } else {
      return constructSimpleFilterQuery(key, value);
    }
  });
  return filters.join(' AND ');
};

const constructSimpleFilterQuery = (key: string, value: unknown): string => {
  const path = constructJsonPath(key);
  return format(
    'data @> %L::jsonb',
    JSON.stringify(buildNestedObject(path, value)),
  );
};

const constructComplexFilterQuery = (
  key: string,
  value: Record<string, unknown>,
): string => {
  const path = constructJsonPath(key);

  if (Object.keys(value).some((k) => k.startsWith('$'))) {
    // Handle MongoDB-like operators
    const subFilters = Object.entries(value).map(([operator, val]) => {
      switch (operator) {
        case '$eq':
          return format(
            'data @> %L::jsonb',
            JSON.stringify(buildNestedObject(path, val)),
          );
        case '$gt':
        case '$gte':
        case '$lt':
        case '$lte':
        case '$ne':
          return format(
            `data #>> %L ${operatorMap[operator]} %L`,
            `{${path.split('.').join(',')}}`,
            val,
          );
        case '$in':
          return format(
            'data #>> %L IN (%s)',
            `{${path.split('.').join(',')}}`,
            (val as unknown[]).map((v) => format('%L', v)).join(', '),
          );
        case '$nin':
          return format(
            'data #>> %L NOT IN (%s)',
            `{${path.split('.').join(',')}}`,
            (val as unknown[]).map((v) => format('%L', v)).join(', '),
          );
        case '$elemMatch':
          return format(
            'data @> %L::jsonb',
            JSON.stringify(buildNestedObject(path, { $elemMatch: val })),
          );
        case '$all':
          return format(
            'data @> %L::jsonb',
            JSON.stringify(buildNestedObject(path, val)),
          );
        case '$size':
          return format(
            'jsonb_array_length(data #> %L) = %L',
            `{${path.split('.').join(',')}}`,
            val,
          );
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }
    });
    return subFilters.join(' AND ');
  } else {
    // Handle nested properties
    return Object.entries(value)
      .map(([nestedKey, nestedValue]) =>
        constructSimpleFilterQuery(`${key}.${nestedKey}`, nestedValue),
      )
      .join(' AND ');
  }
};

const buildNestedObject = (
  path: string,
  value: unknown,
): Record<string, unknown> => {
  return path
    .split('.')
    .reverse()
    .reduce((acc, key) => ({ [key]: acc }), value as Record<string, unknown>);
};

const constructJsonPath = (key: string): string => {
  return key.split('.').join('.');
};
