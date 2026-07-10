import type { JSONSerializer } from '@event-driven-io/dumbo';
import { SQL } from '@event-driven-io/dumbo';
import { OperatorMap } from '../../../../../core';
import { JsonParam } from '../../../../core/jsonParam';
import { PostgresJsonField } from '../jsonField';

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
      const field = PostgresJsonField.json(path);
      const serializedValue = JsonParam.serialize(serializer, value);
      const serializedArrayValue = JsonParam.serializeArray(serializer, value);

      return SQL`(${field} = ${serializedValue}::jsonb OR ${field} @> ${serializedArrayValue}::jsonb)`;
    }
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$ne': {
      const field = PostgresJsonField.text(path);

      return SQL`${field} ${SQL.plain(OperatorMap[operator])} ${value}`;
    }
    case '$in': {
      const field = PostgresJsonField.text(path);

      return SQL`${field} = ANY (${value})`;
    }
    case '$nin': {
      const field = PostgresJsonField.text(path);

      return SQL`${field} != ALL (${value})`;
    }
    case '$elemMatch': {
      const field = PostgresJsonField.json(path);
      const arrayField = SQL`CASE WHEN jsonb_typeof(${field}) = 'array' THEN ${field} ELSE '[]'::jsonb END`;
      const serializedValue = JsonParam.serialize(serializer, value);
      return SQL`EXISTS (
        SELECT 1
        FROM jsonb_array_elements(${arrayField}) AS elem(value)
        WHERE elem.value @> ${serializedValue}::jsonb
      )`;
    }
    case '$all': {
      const serializedValue = JsonParam.serialize(serializer, value);
      return SQL`${PostgresJsonField.json(path)} @> ${serializedValue}::jsonb`;
    }
    case '$size': {
      return SQL`jsonb_array_length(${PostgresJsonField.json(path)}) = ${value}`;
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
