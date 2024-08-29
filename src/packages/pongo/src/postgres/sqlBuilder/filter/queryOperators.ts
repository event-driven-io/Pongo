import { sql } from '@event-driven-io/dumbo';
import { objectEntries, OperatorMap } from '../../../core';

export const handleOperator = (
  path: string,
  operator: string,
  value: unknown,
): string => {
  if (path === '_id') {
    return handleIdOperator(operator, value);
  }

  switch (operator) {
    case '$eq':
      return sql(
        `(data @> %L::jsonb OR jsonb_path_exists(data, '$.%s[*] ? (@ == %s)'))`,
        JSON.stringify(buildNestedObject(path, value)),
        path,
        JSON.stringify(value),
      );
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$ne':
      return sql(
        `data #>> %L ${OperatorMap[operator]} %L`,
        `{${path.split('.').join(',')}}`,
        value,
      );
    case '$in':
      return sql(
        'data #>> %L IN (%s)',
        `{${path.split('.').join(',')}}`,
        (value as unknown[]).map((v) => sql('%L', v)).join(', '),
      );
    case '$nin':
      return sql(
        'data #>> %L NOT IN (%s)',
        `{${path.split('.').join(',')}}`,
        (value as unknown[]).map((v) => sql('%L', v)).join(', '),
      );
    case '$elemMatch': {
      const subQuery = objectEntries(value as Record<string, unknown>)
        .map(([subKey, subValue]) =>
          sql(`@."%s" == %s`, subKey, JSON.stringify(subValue)),
        )
        .join(' && ');
      return sql(`jsonb_path_exists(data, '$.%s[*] ? (%s)')`, path, subQuery);
    }
    case '$all':
      return sql(
        'data @> %L::jsonb',
        JSON.stringify(buildNestedObject(path, value)),
      );
    case '$size':
      return sql(
        'jsonb_array_length(data #> %L) = %L',
        `{${path.split('.').join(',')}}`,
        value,
      );
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
};

const handleIdOperator = (operator: string, value: unknown): string => {
  switch (operator) {
    case '$eq':
      return sql(`_id = %L`, value);
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$ne':
      return sql(`_id ${OperatorMap[operator]} %L`, value);
    case '$in':
      return sql(
        `_id IN (%s)`,
        (value as unknown[]).map((v) => sql('%L', v)).join(', '),
      );
    case '$nin':
      return sql(
        `_id NOT IN (%s)`,
        (value as unknown[]).map((v) => sql('%L', v)).join(', '),
      );
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
};

const buildNestedObject = (
  path: string,
  value: unknown,
): Record<string, unknown> =>
  path
    .split('.')
    .reverse()
    .reduce((acc, key) => ({ [key]: acc }), value as Record<string, unknown>);
