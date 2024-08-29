import { sql, type SQL } from '@event-driven-io/dumbo';
import {
  objectEntries,
  type $inc,
  type $push,
  type $set,
  type $unset,
  type PongoUpdate,
} from '../../../core';

export const buildUpdateQuery = <T>(update: PongoUpdate<T>): SQL =>
  objectEntries(update).reduce((currentUpdateQuery, [op, value]) => {
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
  sql('%s || %L::jsonb', currentUpdateQuery, JSON.stringify(set));

export const buildUnsetQuery = <T>(
  unset: $unset<T>,
  currentUpdateQuery: SQL,
): SQL =>
  sql(
    '%s - %L',
    currentUpdateQuery,
    Object.keys(unset)
      .map((k) => `{${k}}`)
      .join(', '),
  );

export const buildIncQuery = <T>(
  inc: $inc<T>,
  currentUpdateQuery: SQL,
): SQL => {
  for (const [key, value] of Object.entries(inc)) {
    currentUpdateQuery = sql(
      "jsonb_set(%s, '{%s}', to_jsonb((data->>'%s')::numeric + %L), true)",
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
      "jsonb_set(%s, '{%s}', (coalesce(data->'%s', '[]'::jsonb) || %L::jsonb), true)",
      currentUpdateQuery,
      key,
      key,
      JSON.stringify([value]),
    );
  }
  return currentUpdateQuery;
};
