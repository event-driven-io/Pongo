import { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import {
  objectEntries,
  type $inc,
  type $push,
  type $set,
  type $unset,
  type PongoUpdate,
} from '../../../../../core';

export const buildUpdateQuery = <T>(
  update: PongoUpdate<T>,
  serializer: JSONSerializer,
): SQL =>
  objectEntries(update).reduce(
    (currentUpdateQuery, [op, value]) => {
      switch (op) {
        case '$set':
          return buildSetQuery(value, currentUpdateQuery, serializer);
        case '$unset':
          return buildUnsetQuery(value, currentUpdateQuery);
        case '$inc':
          return buildIncQuery(value, currentUpdateQuery);
        case '$push':
          return buildPushQuery(value, currentUpdateQuery, serializer);
        default:
          return currentUpdateQuery;
      }
    },
    SQL`data`,
  );

export const buildSetQuery = <T>(
  set: $set<T>,
  currentUpdateQuery: SQL,
  serializer: JSONSerializer,
): SQL => SQL`${currentUpdateQuery} || ${serializer.serialize(set)}::jsonb`;

export const buildUnsetQuery = <T>(
  unset: $unset<T>,
  currentUpdateQuery: SQL,
): SQL =>
  SQL`${currentUpdateQuery} - ${Object.keys(unset)
    .map((k) => `{${k}}`)
    .join(', ')}`;

export const buildIncQuery = <T>(
  inc: $inc<T>,
  currentUpdateQuery: SQL,
): SQL => {
  for (const [key, value] of Object.entries(inc)) {
    currentUpdateQuery =
      typeof value === 'bigint'
        ? SQL`jsonb_set(${currentUpdateQuery}, '{${SQL.plain(key)}}', to_jsonb((COALESCE((data->>'${SQL.plain(key)}')::BIGINT, 0) + ${value})::TEXT), true)`
        : SQL`jsonb_set(${currentUpdateQuery}, '{${SQL.plain(key)}}', to_jsonb(COALESCE((data->>'${SQL.plain(key)}')::NUMERIC, 0) + ${value}), true)`;
  }
  return currentUpdateQuery;
};

export const buildPushQuery = <T>(
  push: $push<T>,
  currentUpdateQuery: SQL,
  serializer: JSONSerializer,
): SQL => {
  for (const [key, value] of Object.entries(push)) {
    const serializedValue = serializer.serialize([value]);
    currentUpdateQuery = SQL`jsonb_set(${currentUpdateQuery}, '{${SQL.plain(key)}}', (coalesce(data->'${SQL.plain(key)}', '[]'::jsonb) || ${serializedValue}::jsonb), true)`;
  }
  return currentUpdateQuery;
};
