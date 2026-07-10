import { SQL } from '@event-driven-io/dumbo';
import { SQLLiteral } from '../../../core/sqlLiteral';

const pathParts = (path: string): string[] => path.split('.');

const canUseUnquotedArrayElement = (value: string): boolean =>
  /^[A-Za-z0-9_$]+$/.test(value);

const postgreSQLArrayElement = (value: string): string =>
  canUseUnquotedArrayElement(value)
    ? value
    : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const postgreSQLTextArrayLiteral = (values: string[]): string => {
  const arrayValue = `{${values.map(postgreSQLArrayElement).join(',')}}`;
  return SQLLiteral.string(arrayValue);
};

const pathLiteral = (path: string) =>
  SQL.plain(postgreSQLTextArrayLiteral(pathParts(path)));

const json = (path: string): SQL => {
  const parts = pathParts(path);

  return parts.length === 1
    ? SQL`data -> ${SQL.plain(SQLLiteral.string(parts[0]!))}`
    : SQL`data #> ${pathLiteral(path)}`;
};

const text = (path: string): SQL => {
  const parts = pathParts(path);

  return parts.length === 1
    ? SQL`data ->> ${SQL.plain(SQLLiteral.string(parts[0]!))}`
    : SQL`data #>> ${pathLiteral(path)}`;
};

export const PostgresJsonField = {
  json,
  pathLiteral,
  text,
} as const;
