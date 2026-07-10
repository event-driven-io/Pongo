import type { JSONSerializer } from '@event-driven-io/dumbo';
import { JSONParam, SQL } from '@event-driven-io/dumbo';
import { SQLiteJSON } from '@event-driven-io/dumbo/sqlite';
import { objectEntries, OperatorMap } from '../../../../../core';

export const handleOperator = (
  path: string,
  operator: string,
  value: unknown,
  serializer: JSONSerializer,
): SQL => {
  if (path === '_id' || path === '_version') {
    return handleMetadataOperator(path, operator, value);
  }

  switch (operator) {
    case '$eq': {
      const jsonPath = SQLiteJSON.path(path);

      return SQL`(
        json_extract(data, ${jsonPath}) = ${value}
        OR (
          json_type(data, ${jsonPath}) = 'array'
          AND EXISTS(
            SELECT 1 FROM json_each(data, ${jsonPath})
            WHERE json_each.value = ${value}
          )
        )
      )`;
    }
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$ne': {
      const jsonPath = SQLiteJSON.path(path);

      return SQL`json_extract(data, ${jsonPath}) ${SQL.plain(OperatorMap[operator])} ${value}`;
    }
    case '$in': {
      const jsonPath = SQLiteJSON.path(path);
      const values = value as unknown[];
      const inClause = SQL.merge(
        values.map((v) => SQL`${v}`),
        ', ',
      );

      return SQL`json_extract(data, ${jsonPath}) IN (${inClause})`;
    }
    case '$nin': {
      const jsonPath = SQLiteJSON.path(path);
      const values = value as unknown[];
      const inClause = SQL.merge(
        values.map((v) => SQL`${v}`),
        ', ',
      );

      return SQL`json_extract(data, ${jsonPath}) NOT IN (${inClause})`;
    }
    case '$elemMatch': {
      const subConditions = objectEntries(value as Record<string, unknown>).map(
        ([subKey, subValue]) =>
          SQL`json_extract(value, ${SQLiteJSON.path(subKey)}) = json(${JSONParam.value(subValue, serializer)})`,
      );

      const jsonPath = SQLiteJSON.path(path);
      return SQL`EXISTS(SELECT 1 FROM json_each(data, ${jsonPath}) WHERE ${SQL.merge(subConditions, ' AND ')})`;
    }
    case '$all': {
      const jsonPath = SQLiteJSON.path(path);
      const serializedValue = JSONParam.value(value, serializer);

      return SQL`(SELECT COUNT(*) FROM json_each(json(${serializedValue})) WHERE json_each.value NOT IN (SELECT value FROM json_each(data, ${jsonPath}))) = 0`;
    }
    case '$size': {
      const jsonPath = SQLiteJSON.path(path);

      return SQL`json_array_length(json_extract(data, ${jsonPath})) = ${value}`;
    }
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
};

const handleMetadataOperator = (
  fieldName: string,
  operator: string,
  value: unknown,
): SQL => {
  switch (operator) {
    case '$eq':
      return SQL`${SQL.plain(fieldName)} = ${value}`;
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$ne':
      return SQL`${SQL.plain(fieldName)} ${SQL.plain(OperatorMap[operator])} ${value}`;
    case '$in': {
      const values = value as unknown[];
      const inClause = SQL.merge(
        values.map((v) => SQL`${v}`),
        ', ',
      );
      return SQL`${SQL.plain(fieldName)} IN (${inClause})`;
    }
    case '$nin': {
      const values = value as unknown[];
      const inClause = SQL.merge(
        values.map((v) => SQL`${v}`),
        ', ',
      );
      return SQL`${SQL.plain(fieldName)} NOT IN (${inClause})`;
    }
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
};
