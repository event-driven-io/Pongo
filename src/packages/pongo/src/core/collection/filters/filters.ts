import type { SQL } from '@event-driven-io/dumbo';
import type { PongoFilter } from '../../typing';

type PlainObject = Record<string, unknown>;

const asPlainObjectWithSingleKey = <T>(
  filter: PongoFilter<T> | SQL | undefined,
  key: string,
): PlainObject | null => {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter))
    return null;
  const f = filter as PlainObject;
  return Object.keys(f).length === 1 && key in f ? f : null;
};

export const idFromFilter = <T>(
  filter: PongoFilter<T> | SQL | undefined,
): string | null => {
  const f = asPlainObjectWithSingleKey(filter, '_id');
  if (!f) return null;
  return typeof f['_id'] === 'string' ? f['_id'] : null;
};

export const getIdsFromIdOnlyFilter = <T>(
  filter: PongoFilter<T> | SQL | undefined,
): string[] | null => {
  const f = asPlainObjectWithSingleKey(filter, '_id');
  if (!f) return null;
  const idVal = f['_id'];
  if (typeof idVal === 'string') return [idVal];
  if (!idVal || typeof idVal !== 'object' || !('$in' in idVal)) return null;
  const ids = (idVal as PlainObject)['$in'];
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string'))
    return null;
  return ids as string[];
};
