import type { SQL } from '@event-driven-io/dumbo';
import type { PongoFilter } from '../../typing';

const asPlainObjectWithSingleKey = <T>(
  filter: PongoFilter<T> | SQL | undefined,
  key: string,
): Record<string, unknown> | undefined =>
  filter &&
  typeof filter === 'object' &&
  !Array.isArray(filter) &&
  Object.keys(filter).length === 1 &&
  key in filter
    ? filter
    : undefined;

export const idFromFilter = <T>(
  filter: PongoFilter<T> | SQL | undefined,
): string | undefined => {
  const idFilter = asPlainObjectWithSingleKey(filter, '_id');
  return typeof idFilter?.['_id'] === 'string' ? idFilter['_id'] : undefined;
};

export const getIdsFromIdOnlyFilter = <T>(
  filter: PongoFilter<T> | SQL | undefined,
): string[] | undefined => {
  const idFilter = asPlainObjectWithSingleKey(filter, '_id');
  if (!idFilter) return undefined;

  const idValue = idFilter['_id'];
  if (typeof idValue === 'string') return [idValue];

  const $in =
    idValue && typeof idValue === 'object' && '$in' in idValue
      ? idValue['$in']
      : undefined;

  return Array.isArray($in) && $in.every((i) => typeof i === 'string')
    ? $in
    : undefined;
};
