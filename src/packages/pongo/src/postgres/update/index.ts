import type { $inc, $push, $set, $unset, PongoUpdate } from '../../main';
import { entries } from '../../main/typing';
import { sql, type SQL } from '../sql';

export const buildUpdateQuery = <T>(update: PongoUpdate<T>): SQL =>
  entries(update).reduce((currentUpdateQuery, [op, value]) => {
    switch (op) {
      case '$set':
        return buildSetQuery(value, currentUpdateQuery);
      case '$unset':
        return buildUnsetQuery(value, currentUpdateQuery);
      case '$inc':
        return buildIncQuery(value, currentUpdateQuery);
      case '$push':
        return buildPushQuery(value, currentUpdateQuery);
      default:
        return currentUpdateQuery;
    }
  }, sql('data'));

export const buildSetQuery = <T>(set: $set<T>, currentUpdateQuery: SQL): SQL =>
  sql(
    'jsonb_set(%s, %L, data || %L)',
    currentUpdateQuery,
    '{}',
    JSON.stringify(set),
  );

export const buildUnsetQuery = <T>(
  unset: $unset<T>,
  currentUpdateQuery: SQL,
): SQL => sql('%s - %L', currentUpdateQuery, Object.keys(unset).join(', '));

export const buildIncQuery = <T>(
  inc: $inc<T>,
  currentUpdateQuery: SQL,
): SQL => {
  for (const [key, value] of Object.entries(inc)) {
    currentUpdateQuery = sql(
      "jsonb_set(%s, '{%s}', to_jsonb((data->>'%s')::numeric + %L))",
      currentUpdateQuery,
      key,
      key,
      value,
    );
  }
  return currentUpdateQuery;
};

export const buildPushQuery = <T>(
  push: $push<T>,
  currentUpdateQuery: SQL,
): SQL => {
  for (const [key, value] of Object.entries(push)) {
    currentUpdateQuery = sql(
      "jsonb_set(%s, '{%s}', (COALESCE(data->'%s', '[]'::jsonb) || '[%s]'::jsonb))",
      currentUpdateQuery,
      key,
      key,
      JSON.stringify(value),
    );
  }
  return currentUpdateQuery;
};
