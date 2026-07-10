import type { JSONSerializer } from '@event-driven-io/dumbo';
import { JSONParam, SQL } from '@event-driven-io/dumbo';
import { SQLiteJSON } from '@event-driven-io/dumbo/sqlite';
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
): SQL =>
  SQL`json_patch(${currentUpdateQuery}, ${JSONParam.value(set, serializer)})`;

export const buildUnsetQuery = <T>(
  unset: $unset<T>,
  currentUpdateQuery: SQL,
): SQL => {
  const keys = Object.keys(unset);
  let query = currentUpdateQuery;
  for (const key of keys) {
    query = SQL`json_remove(${query}, ${SQLiteJSON.path(key)})`;
  }
  return query;
};

export const buildIncQuery = <T>(
  inc: $inc<T>,
  currentUpdateQuery: SQL,
): SQL => {
  for (const [key, value] of Object.entries(inc)) {
    currentUpdateQuery =
      typeof value === 'bigint'
        ? SQL`json_set(${currentUpdateQuery}, ${SQLiteJSON.path(key)}, CAST((COALESCE(json_extract(${currentUpdateQuery}, ${SQLiteJSON.path(key)}), 0) + ${value}) AS TEXT))`
        : SQL`json_set(${currentUpdateQuery}, ${SQLiteJSON.path(key)}, COALESCE(json_extract(${currentUpdateQuery}, ${SQLiteJSON.path(key)}), 0) + ${value})`;
  }
  return currentUpdateQuery;
};

export const buildPushQuery = <T>(
  push: $push<T>,
  currentUpdateQuery: SQL,
  serializer: JSONSerializer,
): SQL => {
  for (const [key, value] of Object.entries(push)) {
    const serializedValue = JSONParam.value(value, serializer);
    currentUpdateQuery = SQL`json_set(${currentUpdateQuery}, ${SQLiteJSON.path(key)}, CASE
      WHEN json_type(json_extract(${currentUpdateQuery}, ${SQLiteJSON.path(key)})) = 'array'
      THEN json_insert(json_extract(${currentUpdateQuery}, ${SQLiteJSON.path(key)}), '$[#]', json(${serializedValue}))
      ELSE json(${JSONParam.arrayContaining(value, serializer)})
    END)`;
  }
  return currentUpdateQuery;
};
