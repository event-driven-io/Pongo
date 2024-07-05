import format from 'pg-format';
import type { PongoFilter } from '../../main';

export const constructFilterQuery = <T>(filter: PongoFilter<T>): string => {
  const filters = Object.entries(filter).map(([key, value]) => {
    if (typeof value === 'object' && !Array.isArray(value)) {
      return constructComplexFilterQuery(key, value as Record<string, unknown>);
    } else {
      return format('data->>%I = %L', key, value);
    }
  });
  return filters.join(' AND ');
};

export const constructComplexFilterQuery = (
  key: string,
  value: Record<string, unknown>,
): string => {
  const subFilters = Object.entries(value).map(([operator, val]) => {
    switch (operator) {
      case '$eq':
        return format('data->>%I = %L', key, val);
      case '$gt':
        return format('data->>%I > %L', key, val);
      case '$gte':
        return format('data->>%I >= %L', key, val);
      case '$lt':
        return format('data->>%I < %L', key, val);
      case '$lte':
        return format('data->>%I <= %L', key, val);
      case '$ne':
        return format('data->>%I != %L', key, val);
      case '$in':
        return format(
          'data->>%I IN (%s)',
          key,
          (val as unknown[]).map((v) => format('%L', v)).join(', '),
        );
      case '$nin':
        return format(
          'data->>%I NOT IN (%s)',
          key,
          (val as unknown[]).map((v) => format('%L', v)).join(', '),
        );
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  });
  return subFilters.join(' AND ');
};
