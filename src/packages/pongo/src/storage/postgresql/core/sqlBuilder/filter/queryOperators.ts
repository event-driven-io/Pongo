import type { JSONSerializer } from '@event-driven-io/dumbo';
import { JSONParam, SQL } from '@event-driven-io/dumbo';
import { PostgreSQLJSON } from '@event-driven-io/dumbo/postgresql';
import { OperatorMap } from '../../../../../core';

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
      const field = PostgreSQLJSON.field(SQL`data`, path);
      const serializedValue = JSONParam.value(value, serializer);
      const serializedArrayValue = JSONParam.arrayContaining(
        value,
        serializer,
      );

      return SQL`(${field} = ${serializedValue}::jsonb OR ${field} @> ${serializedArrayValue}::jsonb)`;
    }
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$ne': {
      const field = PostgreSQLJSON.textField(SQL`data`, path);

      return SQL`${field} ${SQL.plain(OperatorMap[operator])} ${value}`;
    }
    case '$in': {
      const field = PostgreSQLJSON.textField(SQL`data`, path);

      return SQL`${field} = ANY (${value})`;
    }
    case '$nin': {
      const field = PostgreSQLJSON.textField(SQL`data`, path);

      return SQL`${field} != ALL (${value})`;
    }
    case '$elemMatch': {
      const field = PostgreSQLJSON.field(SQL`data`, path);
      const arrayField = SQL`CASE WHEN jsonb_typeof(${field}) = 'array' THEN ${field} ELSE '[]'::jsonb END`;
      const serializedValue = JSONParam.value(value, serializer);
      return SQL`EXISTS (
        SELECT 1
        FROM jsonb_array_elements(${arrayField}) AS elem(value)
        WHERE elem.value @> ${serializedValue}::jsonb
      )`;
    }
    case '$all': {
      const serializedValue = JSONParam.value(value, serializer);
      return SQL`${PostgreSQLJSON.field(SQL`data`, path)} @> ${serializedValue}::jsonb`;
    }
    case '$size': {
      return SQL`jsonb_array_length(${PostgreSQLJSON.field(SQL`data`, path)}) = ${value}`;
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
    case '$in':
      return SQL`${SQL.plain(fieldName)} = ANY (${value})`;
    case '$nin':
      return SQL`${SQL.plain(fieldName)} != ALL (${value})`;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
};
