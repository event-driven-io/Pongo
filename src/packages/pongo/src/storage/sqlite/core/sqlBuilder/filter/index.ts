import type { JSONSerializer } from '@event-driven-io/dumbo';
import { SQL } from '@event-driven-io/dumbo';
import {
  hasOperators,
  objectEntries,
  QueryOperators,
  type PongoFilter,
} from '../../../../../core';
import { handleOperator } from './queryOperators';

export * from './queryOperators';

const AND = 'AND';
const OR = 'OR';

const unsupportedRootOperators = ['$text', '$where', '$comment'] as const;

export const constructFilterQuery = <T>(
  filter: PongoFilter<T>,
  serializer: JSONSerializer,
): SQL => {
  ensureSupportedRootOperators(filter);
  const parts: SQL[] = [];

  const fieldFilterQuery = constructFieldFilterQuery(filter, serializer);
  if (!SQL.check.isEmpty(fieldFilterQuery)) {
    parts.push(fieldFilterQuery);
  }

  const orFilterQuery = constructLogicalFilterQuery(filter.$or, OR, serializer);
  if (!SQL.check.isEmpty(orFilterQuery)) {
    parts.push(orFilterQuery);
  }

  const andFilterQuery = constructLogicalFilterQuery(
    filter.$and,
    AND,
    serializer,
  );
  if (!SQL.check.isEmpty(andFilterQuery)) {
    parts.push(andFilterQuery);
  }

  const norFilterQuery = constructNorFilterQuery(filter.$nor, serializer);
  if (!SQL.check.isEmpty(norFilterQuery)) {
    parts.push(norFilterQuery);
  }

  return SQL.merge(parts, ` ${AND} `);
};

const constructFieldFilterQuery = <T>(
  filter: PongoFilter<T>,
  serializer: JSONSerializer,
): SQL =>
  SQL.merge(
    objectEntries(filter).flatMap(([key, value]) =>
      isLogicalRootOperator(key)
        ? []
        : [
            isRecord(value)
              ? constructComplexFilterQuery(key, value, serializer)
              : handleOperator(key, QueryOperators.$eq, value, serializer),
          ],
    ),
    ` ${AND} `,
  );

const constructLogicalFilterQuery = <T>(
  filters: PongoFilter<T>[] | undefined,
  joinOperator: typeof AND | typeof OR,
  serializer: JSONSerializer,
): SQL => {
  if (!filters?.length) {
    return SQL.EMPTY;
  }

  const subFilterQueries = filters.reduce<SQL[]>((queries, filter) => {
    const query = constructFilterQuery(filter, serializer);
    if (!SQL.check.isEmpty(query)) {
      queries.push(query);
    }

    return queries;
  }, []);

  if (subFilterQueries.length === 0) {
    return SQL.EMPTY;
  }

  if (subFilterQueries.length === 1) {
    return wrapFilterQuery(subFilterQueries[0]!);
  }

  return SQL`(${SQL.merge(subFilterQueries.map(wrapFilterQuery), ` ${joinOperator} `)})`;
};

const constructNorFilterQuery = <T>(
  filters: PongoFilter<T>[] | undefined,
  serializer: JSONSerializer,
): SQL => {
  if (!filters?.length) {
    return SQL.EMPTY;
  }

  const logicalFilterQuery = constructLogicalFilterQuery(
    filters,
    OR,
    serializer,
  );
  return SQL.check.isEmpty(logicalFilterQuery)
    ? SQL.EMPTY
    : SQL`NOT ${logicalFilterQuery}`;
};

const constructComplexFilterQuery = (
  key: string,
  value: Record<string, unknown>,
  serializer: JSONSerializer,
): SQL => {
  const isEquality = !hasOperators(value);

  return SQL.merge(
    objectEntries(value).map(([nestedKey, val]) =>
      isEquality
        ? handleOperator(
            `${key}.${nestedKey}`,
            QueryOperators.$eq,
            val,
            serializer,
          )
        : handleOperator(key, nestedKey, val, serializer),
    ),
    ` ${AND} `,
  );
};

const wrapFilterQuery = (filterQuery: SQL): SQL => SQL`(${filterQuery})`;

const ensureSupportedRootOperators = (filter: object): void => {
  for (const operator of unsupportedRootOperators) {
    if (operator in filter) {
      throw new Error(`Unsupported root operator: ${operator}`);
    }
  }
};

const isLogicalRootOperator = (key: string): key is '$and' | '$nor' | '$or' =>
  key === '$and' || key === '$nor' || key === '$or';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
