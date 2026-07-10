import type { JSONSerializer } from '@event-driven-io/dumbo';
import { JSONParam, SQL } from '@event-driven-io/dumbo';
import { PostgreSQLJSON } from '@event-driven-io/dumbo/postgresql';
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
  SQL`${currentUpdateQuery} || ${JSONParam.value(set, serializer)}::jsonb`;

export const buildUnsetQuery = <T>(
  unset: $unset<T>,
  currentUpdateQuery: SQL,
): SQL => {
  let query = currentUpdateQuery;
  for (const key of Object.keys(unset)) {
    query = SQL`${query} - ${key}`;
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
        ? SQL`jsonb_set(${currentUpdateQuery}, ${PostgreSQLJSON.path(key)}, to_jsonb((COALESCE((${PostgreSQLJSON.textField(SQL`data`, key)})::BIGINT, 0) + ${value})::TEXT), true)`
        : SQL`jsonb_set(${currentUpdateQuery}, ${PostgreSQLJSON.path(key)}, to_jsonb(COALESCE((${PostgreSQLJSON.textField(SQL`data`, key)})::NUMERIC, 0) + ${value}), true)`;
  }
  return currentUpdateQuery;
};

export const buildPushQuery = <T>(
  push: $push<T>,
  currentUpdateQuery: SQL,
  serializer: JSONSerializer,
): SQL => {
  for (const [key, value] of Object.entries(push)) {
    const serializedValue = JSONParam.arrayContaining(value, serializer);
    currentUpdateQuery = SQL`jsonb_set(${currentUpdateQuery}, ${PostgreSQLJSON.path(key)}, (coalesce(${PostgreSQLJSON.field(SQL`data`, key)}, '[]'::jsonb) || ${serializedValue}::jsonb), true)`;
  }
  return currentUpdateQuery;
};
