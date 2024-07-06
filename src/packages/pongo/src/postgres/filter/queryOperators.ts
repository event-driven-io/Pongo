import format from 'pg-format';
import { buildNestedObject } from '.';

const operatorMap = {
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
  $ne: '!=',
};

export const hasOperators = (value: Record<string, unknown>) =>
  Object.keys(value).some((k) => k.startsWith('$'));

export const handleOperator = (
  path: string,
  operator: string,
  value: unknown,
) => {
  switch (operator) {
    case '$eq':
      return format(
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
      return format(
        `data #>> %L ${operatorMap[operator]} %L`,
        `{${path.split('.').join(',')}}`,
        value,
      );
    case '$in':
      return format(
        'data #>> %L IN (%s)',
        `{${path.split('.').join(',')}}`,
        (value as unknown[]).map((v) => format('%L', v)).join(', '),
      );
    case '$nin':
      return format(
        'data #>> %L NOT IN (%s)',
        `{${path.split('.').join(',')}}`,
        (value as unknown[]).map((v) => format('%L', v)).join(', '),
      );
    case '$elemMatch':
      return format(
        'data @> %L::jsonb',
        JSON.stringify(buildNestedObject(path, { $elemMatch: value })),
      );
    case '$all':
      return format(
        'data @> %L::jsonb',
        JSON.stringify(buildNestedObject(path, value)),
      );
    case '$size':
      return format(
        'jsonb_array_length(data #> %L) = %L',
        `{${path.split('.').join(',')}}`,
        value,
      );
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
};
