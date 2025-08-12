import { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import { objectEntries, OperatorMap } from '../../../../core';

export const handleOperator = (
  path: string,
  operator: string,
  value: unknown,
): SQL => {
  if (path === '_id' || path === '_version') {
    return handleMetadataOperator(path, operator, value);
  }

  switch (operator) {
    case '$eq': {
      const nestedPath = JSONSerializer.serialize(
        buildNestedObject(path, value),
      );
      const serializedValue = JSONSerializer.serialize(value);

      return SQL`(data @> ${nestedPath}::jsonb OR jsonb_path_exists(data, '$.${SQL.plain(path)}[*] ? (@ == ${SQL.plain(serializedValue)})'))`;
    }
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
    case '$ne': {
      const jsonPath = SQL.plain(path.split('.').join(','));

      return SQL`data ->> '${jsonPath}' ${SQL.plain(OperatorMap[operator])} ${value}`;
    }
    case '$in': {
      const jsonPath = `{${path.split('.').join(',')}}`;

      return SQL`data #>> ${jsonPath} IN ${value as unknown[]}`;
    }
    case '$nin': {
      const jsonPath = `{${path.split('.').join(',')}}`;

      return SQL`data #>> ${jsonPath} NOT IN ${value as unknown[]}`;
    }
    case '$elemMatch': {
      const subQuery = objectEntries(value as Record<string, unknown>)
        .map(
          ([subKey, subValue]) =>
            `@."${subKey}" == ${JSONSerializer.serialize(subValue)}`,
        )
        .join(' && ');
      return SQL`jsonb_path_exists(data, '$.${SQL.plain(path)}[*] ? (${SQL.plain(subQuery)})')`;
    }
    case '$all': {
      const nestedPath = JSONSerializer.serialize(
        buildNestedObject(path, value),
      );
      return SQL`data @> ${nestedPath}::jsonb`;
    }
    case '$size': {
      const jsonPath = `{${path.split('.').join(',')}}`;

      return SQL`jsonb_array_length(data #> ${jsonPath}) = ${value}`;
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
      return SQL`${SQL.plain(fieldName)} IN ${value as unknown[]}`;
    case '$nin':
      return SQL`${SQL.plain(fieldName)} NOT IN ${value as unknown[]}`;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
};

const buildNestedObject = (
  path: string,
  value: unknown,
): Record<string, unknown> =>
  path
    .split('.')
    .reverse()
    .reduce((acc, key) => ({ [key]: acc }), value as Record<string, unknown>);
