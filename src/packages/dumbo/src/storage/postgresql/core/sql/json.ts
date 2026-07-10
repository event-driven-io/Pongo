import { SQL } from '../../../../core';

const pathParts = (path: string): string[] => path.split('.');

const canUseUnquotedArrayElement = (value: string): boolean =>
  /^[A-Za-z0-9_$]+$/.test(value);

const arrayElement = (value: string): string =>
  canUseUnquotedArrayElement(value)
    ? value
    : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const pathArrayLiteral = (values: string[]): string => {
  const arrayValue = `{${values.map(arrayElement).join(',')}}`;
  return SQL.stringLiteral(arrayValue).value;
};

const path = (path: string) => SQL.plain(pathArrayLiteral(pathParts(path)));

const field = (source: SQL, path: string): SQL => {
  const parts = pathParts(path);

  return parts.length === 1
    ? SQL`${source} -> ${SQL.stringLiteral(parts[0]!)}`
    : SQL`${source} #> ${PostgreSQLJSON.path(path)}`;
};

const textField = (source: SQL, path: string): SQL => {
  const parts = pathParts(path);

  return parts.length === 1
    ? SQL`${source} ->> ${SQL.stringLiteral(parts[0]!)}`
    : SQL`${source} #>> ${PostgreSQLJSON.path(path)}`;
};

export const PostgreSQLJSON = {
  field,
  path,
  textField,
} as const;
