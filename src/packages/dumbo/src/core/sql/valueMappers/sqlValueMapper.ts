import { JSONSerializer } from '../../serializer';
import { SQL } from '../sql';
import { ansiSqlReservedMap as ansiSqlReservedWordsMap } from './reservedSqlWords';

export interface SQLValueMapper {
  mapValue: MapSQLParamValue;
  mapPlaceholder: (index: number, value: unknown) => string;
  mapIdentifier: (value: string) => string;
}

export type MapSQLParamValue = (
  value: unknown,
  options?: MapSQLParamValueOptions,
) => unknown;

export interface MapSQLParamValueOptions {
  mapBoolean?: (value: boolean) => unknown;
  mapArray?: (array: unknown[], mapValue: MapSQLParamValue) => unknown[];
  mapDate?: (value: Date) => unknown;
  mapObject?: (value: object) => unknown;
  mapBigInt?: (value: bigint) => unknown;
  mapValue?: MapSQLParamValue;
  mapPlaceholder?: (index: number, value: unknown) => string;
  mapIdentifier?: (value: string) => string;
}

export const ANSISQLParamPlaceholder = '?';
export const ANSISQLIdentifierQuote = '"';

export const mapANSISQLParamPlaceholder = () => ANSISQLParamPlaceholder;

const isReserved = (
  value: string,
  reserved: {
    [key: string]: boolean;
  },
): boolean => !!reserved[value.toUpperCase()];

export const mapSQLIdentifier = (
  value: string,
  options?: {
    reservedWords: {
      [key: string]: boolean;
    };
    quote?: string;
  },
): string => {
  if (value === undefined || value === null) {
    throw new Error('SQL identifier cannot be null or undefined');
  }

  const ident = value.toString().slice(0); // create copy
  const quoteSign = options?.quote ?? ANSISQLIdentifierQuote;

  // do not quote a valid, unquoted identifier
  if (
    /^[a-z_][a-z0-9_$]*$/.test(ident) &&
    !isReserved(ident, options?.reservedWords ?? ansiSqlReservedWordsMap)
  ) {
    return ident;
  }

  let quoted = quoteSign;
  for (let i = 0; i < ident.length; i++) {
    const c = ident[i];
    quoted += c === quoteSign ? c + c : c;
  }
  quoted += quoteSign;
  return quoted;
};

export const DefaultMapSQLParamValueOptions = {
  mapPlaceholder: mapANSISQLParamPlaceholder,
  mapIdentifier: mapSQLIdentifier,
};

export const SQLValueMapper = (
  options?: MapSQLParamValueOptions,
): SQLValueMapper => {
  const mapSQLParamValueOptions = {
    ...DefaultMapSQLParamValueOptions,
    ...(options ?? {}),
  };

  const resultMapper: SQLValueMapper = {
    mapValue: (value: unknown) =>
      mapSQLParamValue(value, mapSQLParamValueOptions),
    mapPlaceholder: mapSQLParamValueOptions.mapPlaceholder,
    mapIdentifier: mapSQLParamValueOptions.mapIdentifier,
  };
  return resultMapper;
};

export function mapSQLParamValue(
  value: unknown,
  options?: MapSQLParamValueOptions,
): unknown {
  if (value === null || value === undefined) {
    return null;
  } else if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'string') {
    return value;
  } else if (Array.isArray(value)) {
    const mapValue: MapSQLParamValue = options?.mapValue ?? mapSQLParamValue;
    return options?.mapArray
      ? options.mapArray(value, mapValue)
      : value.map((item) => mapValue(item, options));
  } else if (typeof value === 'boolean') {
    return options?.mapBoolean ? options.mapBoolean(value) : value;
  } else if (typeof value === 'bigint') {
    return options?.mapBigInt ? options.mapBigInt(value) : value.toString();
  } else if (value instanceof Date) {
    return options?.mapDate ? options.mapDate(value) : value.toISOString();
  } else if (SQL.check.isIdentifier(value)) {
    return (options?.mapIdentifier ?? mapSQLIdentifier)(value.value);
  } else if (typeof value === 'object') {
    return options?.mapObject
      ? options.mapObject(value)
      : `${JSONSerializer.serialize(value).replace(/'/g, "''")}`;
  } else {
    return JSONSerializer.serialize(value);
  }
}
