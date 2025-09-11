import { JSONSerializer } from '../../serializer';
import { SQL } from '../sql';

export interface SQLValueMapper {
  mapBoolean?: (value: boolean) => unknown;
  mapArray?: (
    array: unknown[],
    itemFormatter: (item: unknown) => unknown,
  ) => unknown[];
  mapDate?: (value: Date) => unknown;
  mapObject?: (value: object) => unknown;
  mapBigInt?: (value: bigint) => unknown;
  mapValue: (value: unknown) => unknown;
  mapPlaceholder: (index: number, value: unknown) => string;
  mapIdentifier: (value: string) => string;
}

export const GetDefaultSQLParamPlaceholder = () => `?`;

export const SQLValueMapper = (
  mapper?: Partial<SQLValueMapper>,
): SQLValueMapper => {
  const resultMapper: SQLValueMapper = {
    mapValue: (value: unknown) => mapSQLParamValue(value, resultMapper),
    mapPlaceholder: GetDefaultSQLParamPlaceholder,
    mapIdentifier: (value: string) => value,
    ...(mapper ?? {}),
  };
  return resultMapper;
};

export function mapSQLParamValue(
  value: unknown,
  valueMapper: SQLValueMapper,
): unknown {
  if (value === null || value === undefined) {
    return null;
  } else if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'string') {
    return value;
  } else if (Array.isArray(value)) {
    return valueMapper.mapArray
      ? valueMapper.mapArray(value, valueMapper.mapValue.bind(valueMapper))
      : value.map((item) => valueMapper.mapValue.bind(valueMapper)(item));
  } else if (typeof value === 'boolean') {
    return valueMapper.mapBoolean ? valueMapper.mapBoolean(value) : value;
  } else if (typeof value === 'bigint') {
    return valueMapper.mapBigInt
      ? valueMapper.mapBigInt(value)
      : value.toString();
  } else if (value instanceof Date) {
    return valueMapper.mapDate
      ? valueMapper.mapDate(value)
      : value.toISOString();
  } else if (SQL.check.isIdentifier(value)) {
    return valueMapper.mapIdentifier(value.value);
  } else if (typeof value === 'object') {
    return valueMapper.mapObject
      ? valueMapper.mapObject(value)
      : `${JSONSerializer.serialize(value).replace(/'/g, "''")}`;
  } else {
    return JSONSerializer.serialize(value);
  }
}
