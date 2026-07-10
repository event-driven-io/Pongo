import type { JSONSerializer } from '@event-driven-io/dumbo';
import { SQL } from '@event-driven-io/dumbo';
import {
  objectEntries,
  type $inc,
  type $push,
  type $set,
  type $unset,
  type PongoUpdate,
} from '../../../../../core';
import { JsonParam } from '../../../../core/jsonParam';
import { sqliteJsonPathLiteral } from '../jsonPath';

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
  SQL`json_patch(${currentUpdateQuery}, ${JsonParam.serialize(serializer, set)})`;

export const buildUnsetQuery = <T>(
  unset: $unset<T>,
  currentUpdateQuery: SQL,
): SQL => {
  const keys = Object.keys(unset);
  let query = currentUpdateQuery;
  for (const key of keys) {
    query = SQL`json_remove(${query}, ${sqliteJsonPathLiteral(key)})`;
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
        ? SQL`json_set(${currentUpdateQuery}, ${sqliteJsonPathLiteral(key)}, CAST((COALESCE(json_extract(${currentUpdateQuery}, ${sqliteJsonPathLiteral(key)}), 0) + ${value}) AS TEXT))`
        : SQL`json_set(${currentUpdateQuery}, ${sqliteJsonPathLiteral(key)}, COALESCE(json_extract(${currentUpdateQuery}, ${sqliteJsonPathLiteral(key)}), 0) + ${value})`;
  }
  return currentUpdateQuery;
};

export const buildPushQuery = <T>(
  push: $push<T>,
  currentUpdateQuery: SQL,
  serializer: JSONSerializer,
): SQL => {
  for (const [key, value] of Object.entries(push)) {
    const serializedValue = JsonParam.serialize(serializer, value);
    currentUpdateQuery = SQL`json_set(${currentUpdateQuery}, ${sqliteJsonPathLiteral(key)}, CASE
      WHEN json_type(json_extract(${currentUpdateQuery}, ${sqliteJsonPathLiteral(key)})) = 'array'
      THEN json_insert(json_extract(${currentUpdateQuery}, ${sqliteJsonPathLiteral(key)}), '$[#]', json(${serializedValue}))
      ELSE json(${JsonParam.serializeArray(serializer, value)})
    END)`;
  }
  return currentUpdateQuery;
};
