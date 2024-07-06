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
  val: unknown,
) => {
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
};
