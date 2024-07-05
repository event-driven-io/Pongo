// src/utils.ts
import format from 'pg-format';
import type { PongoFilter } from '../../main';

export const constructFilterQuery = <T>(filter: PongoFilter<T>): string => {
  const filters = Object.entries(filter).map(([key, value]) => {
    if (typeof value === 'object' && !Array.isArray(value)) {
      return constructComplexFilterQuery(key, value as Record<string, unknown>);
    } else {
      return constructSimpleFilterQuery(key, value);
    }
  });
  return filters.join(' AND ');
};

const constructSimpleFilterQuery = (key: string, value: unknown): string => {
  if (isUUID(value)) {
    return format(`(data->>'%I')::text = %L::text`, key, value);
  } else if (isDate(value)) {
    return format(`(data->>'%I')::timestamp = %L::timestamp`, key, value);
  } else if (isNumber(value)) {
    return format(`(data->>'%I')::numeric = %L`, key, value);
  } else {
    return format(`(data->>'%I') = %L`, key, value);
  }
};

export const constructComplexFilterQuery = (
  key: string,
  value: Record<string, unknown>,
): string => {
  const subFilters = Object.entries(value).map(([operator, val]) => {
    switch (operator) {
      case '$eq':
        return constructSimpleFilterQuery(key, val);
      case '$gt':
        return constructComparisonFilterQuery(key, val, '>');
      case '$gte':
        return constructComparisonFilterQuery(key, val, '>=');
      case '$lt':
        return constructComparisonFilterQuery(key, val, '<');
      case '$lte':
        return constructComparisonFilterQuery(key, val, '<=');
      case '$ne':
        return constructSimpleFilterQuery(key, val).replace('=', '!=');
      case '$in':
        return format(
          `(data->>'%I') IN (%s)`,
          key,
          (val as unknown[])
            .map((v) => constructSimpleFilterQueryValue(key, v))
            .join(', '),
        );
      case '$nin':
        return format(
          `(data->>'%I') NOT IN (%s)`,
          key,
          (val as unknown[])
            .map((v) => constructSimpleFilterQueryValue(key, v))
            .join(', '),
        );
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  });
  return subFilters.join(' AND ');
};

const constructComparisonFilterQuery = (
  key: string,
  value: unknown,
  operator: string,
): string => {
  if (isUUID(value)) {
    return format(`(data->>'%I')::text ${operator} %L::text`, key, value);
  } else if (isDate(value)) {
    return format(
      `(data->>'%I')::timestamp ${operator} %L::timestamp`,
      key,
      value,
    );
  } else if (isNumber(value)) {
    return format(`(data->>'%I')::numeric ${operator} %s`, key, value);
  } else {
    return format(`(data->>'%I') ${operator} %L`, key, value);
  }
};

const constructSimpleFilterQueryValue = (
  key: string,
  value: unknown,
): string => {
  if (isUUID(value)) {
    return format('%L::text', value);
  } else if (isDate(value)) {
    return format('%L::timestamp', value);
  } else if (isNumber(value)) {
    return format('%L', value);
  } else {
    return format('%L', value);
  }
};

const isUUID = (value: unknown): boolean => {
  return typeof value === 'string' && /^[0-9a-fA-F-]{36}$/.test(value);
};

const isDate = (value: unknown): boolean => {
  return typeof value === 'string' && !isNaN(Date.parse(value));
};

const isNumber = (value: unknown): boolean => {
  return typeof value === 'number';
};
