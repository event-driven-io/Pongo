import type { JSONSerializer } from '@event-driven-io/dumbo';
import { SQL } from '@event-driven-io/dumbo';
import {
  hasOperators,
  objectEntries,
  QueryOperators,
  type RootFilterOperators,
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
  ensureSupportedRootOperators(filter as Record<string, unknown>);

  const { $or, $and, $nor, ...rest } = filter as PongoFilter<T> &
    RootFilterOperators<T>;
  const parts: SQL[] = [];

  const fieldFilterQuery = constructFieldFilterQuery(rest, serializer);
  if (!SQL.check.isEmpty(fieldFilterQuery)) {
    parts.push(fieldFilterQuery);
  }

  const orFilterQuery = constructLogicalFilterQuery($or, OR, serializer);
  if (!SQL.check.isEmpty(orFilterQuery)) {
    parts.push(orFilterQuery);
  }

  const andFilterQuery = constructLogicalFilterQuery($and, AND, serializer);
  if (!SQL.check.isEmpty(andFilterQuery)) {
    parts.push(andFilterQuery);
  }

  const norFilterQuery = constructNorFilterQuery($nor, serializer);
  if (!SQL.check.isEmpty(norFilterQuery)) {
    parts.push(norFilterQuery);
  }

  return SQL.merge(parts, ` ${AND} `);
};

const constructFieldFilterQuery = (
  filter: Record<string, unknown>,
  serializer: JSONSerializer,
): SQL =>
  SQL.merge(
    Object.entries(filter).map(([key, value]) =>
      isRecord(value)
        ? constructComplexFilterQuery(key, value, serializer)
        : handleOperator(key, QueryOperators.$eq, value, serializer),
    ),
    ` ${AND} `,
  );

const constructLogicalFilterQuery = <T>(
  filters: PongoFilter<T>[] | undefined,
  joinOperator: typeof AND | typeof OR,
  serializer: JSONSerializer,
): SQL => {
  if (!filters) {
    return SQL.EMPTY;
  }

  if (filters.length === 0) {
    return joinOperator === OR ? SQL`1 = 0` : SQL.EMPTY;
  }

  return SQL`(${SQL.merge(
    filters.map((filter) =>
      wrapFilterQuery(constructFilterQuery(filter, serializer)),
    ),
    ` ${joinOperator} `,
  )})`;
};

const constructNorFilterQuery = <T>(
  filters: PongoFilter<T>[] | undefined,
  serializer: JSONSerializer,
): SQL => {
  if (!filters || filters.length === 0) {
    return SQL.EMPTY;
  }

  return SQL`NOT ${constructLogicalFilterQuery(filters, OR, serializer)}`;
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

const wrapFilterQuery = (filterQuery: SQL): SQL =>
  SQL.check.isEmpty(filterQuery) ? SQL`(1 = 1)` : SQL`(${filterQuery})`;

const ensureSupportedRootOperators = (
  filter: Record<string, unknown>,
): void => {
  for (const operator of unsupportedRootOperators) {
    if (operator in filter) {
      throw new Error(`Unsupported root operator: ${operator}`);
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
