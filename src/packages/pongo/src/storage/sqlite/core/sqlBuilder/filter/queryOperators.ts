import type { JSONSerializer } from '@event-driven-io/dumbo';
import { SQL } from '@event-driven-io/dumbo';
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
      const jsonPath = buildJsonPath(path);

      return SQL`(
        json_extract(data, '${SQL.plain(jsonPath)}') = ${value}
        OR (
          json_type(data, '${SQL.plain(jsonPath)}') = 'array'
          AND EXISTS(
            SELECT 1 FROM json_each(data, '${SQL.plain(jsonPath)}')
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
      const jsonPath = buildJsonPath(path);

      return SQL`json_extract(data, '${SQL.plain(jsonPath)}') ${SQL.plain(OperatorMap[operator])} ${value}`;
    }
    case '$in': {
      const jsonPath = buildJsonPath(path);
      const values = value as unknown[];
      const inClause = SQL.merge(
        values.map((v) => SQL`${v}`),
        ', ',
      );

      return SQL`json_extract(data, '${SQL.plain(jsonPath)}') IN (${inClause})`;
    }
    case '$nin': {
      const jsonPath = buildJsonPath(path);
      const values = value as unknown[];
      const inClause = SQL.merge(
        values.map((v) => SQL`${v}`),
        ', ',
      );

      return SQL`json_extract(data, '${SQL.plain(jsonPath)}') NOT IN (${inClause})`;
    }
    case '$elemMatch': {
      const subConditions = objectEntries(value as Record<string, unknown>)
        .map(([subKey, subValue]) => {
          const serializedValue = serializer.serialize(subValue);
          return `json_extract(value, '$.${subKey}') = json('${serializedValue}')`;
        })
        .join(' AND ');

      const jsonPath = buildJsonPath(path);
      return SQL`EXISTS(SELECT 1 FROM json_each(data, '${SQL.plain(jsonPath)}') WHERE ${SQL.plain(subConditions)})`;
    }
    case '$all': {
      const jsonPath = buildJsonPath(path);
      const serializedValue = serializer.serialize(value);

      return SQL`(SELECT COUNT(*) FROM json_each(json(${serializedValue})) WHERE json_each.value NOT IN (SELECT value FROM json_each(data, '${SQL.plain(jsonPath)}'))) = 0`;
    }
    case '$size': {
      const jsonPath = buildJsonPath(path);

      return SQL`json_array_length(json_extract(data, '${SQL.plain(jsonPath)}')) = ${value}`;
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

const buildJsonPath = (path: string): string => {
  return `$.${path}`;
};
