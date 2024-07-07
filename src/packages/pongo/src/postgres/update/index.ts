import type { $inc, $push, $set, $unset, PongoUpdate } from '../../main';
import { sql, type SQL } from '../sql';

export const buildUpdateQuery = <T>(update: PongoUpdate<T>): SQL => {
  let updateQuery = sql('data');

  if ('$set' in update && update.$set)
    updateQuery = buildSetQuery(update.$set, updateQuery);

  if ('$unset' in update && update.$unset)
    updateQuery = buildUnsetQuery(update.$unset, updateQuery);

  if ('$inc' in update && update.$inc)
    updateQuery = buildIncQuery(update.$inc, updateQuery);

  if ('$push' in update && update.$push)
    updateQuery = buildPushQuery(update.$push, updateQuery);

  return updateQuery;
};

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
