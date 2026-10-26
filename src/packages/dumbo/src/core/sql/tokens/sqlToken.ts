import { withProps } from '../../utils/withProps';
import { isSQLToken, sqlToken } from './sqlTokenFactory';

export type SQLToken<
  TSymbol extends string = string,
  TProps extends Omit<Record<string, unknown>, 'sqlTokenType'> | undefined =
    Omit<Record<string, unknown>, 'sqlTokenType'> | undefined,
> = {
  sqlTokenType: TSymbol;
} & (TProps extends undefined ? void : Omit<TProps, 'sqlTokenType'>);

export type ExtractSQLTokenType<T> = T extends (...args: never[]) => infer R
  ? R extends SQLToken
    ? R
    : never
  : T extends SQLToken
    ? T
    : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySQLToken = SQLToken<string, any>;

export const SQLToken = withProps(sqlToken, {
  check: isSQLToken,
});

export type SQLIdentifier = SQLToken<'SQL_IDENTIFIER', { value: string }>;
export const SQLIdentifier = sqlToken<SQLIdentifier, string>(
  'SQL_IDENTIFIER',
  (value) => ({
    value,
  }),
);

export type SQLTableReference = SQLToken<
  'SQL_TABLE_REFERENCE',
  {
    databaseSchemaName: string;
    tableName: string;
  }
>;
export const SQLTableReference = sqlToken<SQLTableReference>(
  'SQL_TABLE_REFERENCE',
);

export const haveSameTableReference = (
  left: SQLTableReference,
  right: SQLTableReference,
): boolean =>
  left.tableName === right.tableName &&
  left.databaseSchemaName === right.databaseSchemaName;

export type SQLRenameTable = SQLToken<
  'SQL_RENAME_TABLE',
  {
    table: SQLTableReference;
    newTableName: string;
  }
>;
export const SQLRenameTable = sqlToken<SQLRenameTable>('SQL_RENAME_TABLE');

export type SQLIndexReference = SQLToken<
  'SQL_INDEX_REFERENCE',
  {
    databaseSchemaName: string;
    tableName: string;
    indexName: string;
  }
>;
export const SQLIndexReference = sqlToken<SQLIndexReference>(
  'SQL_INDEX_REFERENCE',
);

export type SQLCreateSchema = SQLToken<
  'SQL_CREATE_SCHEMA',
  { databaseSchemaName: string }
>;
export const SQLCreateSchema = sqlToken<SQLCreateSchema>('SQL_CREATE_SCHEMA');

export type SQLJSONDocumentIndexTarget = SQLToken<
  'SQL_JSON_DOCUMENT_INDEX_TARGET',
  { columnName: string; isUnique: boolean }
>;
export const SQLJSONDocumentIndexTarget = sqlToken<SQLJSONDocumentIndexTarget>(
  'SQL_JSON_DOCUMENT_INDEX_TARGET',
);

export type SQLJSONPathTarget = SQLToken<
  'SQL_JSON_PATH_TARGET',
  { columnName: string; path: readonly string[] }
>;
export const SQLJSONPathTarget = sqlToken<SQLJSONPathTarget>(
  'SQL_JSON_PATH_TARGET',
);

export type SQLPlain = SQLToken<'SQL_RAW', { value: string }>;
export const SQLPlain = sqlToken<SQLPlain, string>('SQL_RAW', (value) => ({
  value,
}));

export type SQLLiteral = SQLToken<'SQL_LITERAL', { value: unknown }>;
export const SQLLiteral = sqlToken<SQLLiteral, unknown>(
  'SQL_LITERAL',
  (value) => ({
    value,
  }),
);

export type SQLArrayMode = 'params' | 'native';

export type SQLArray = SQLToken<
  'SQL_ARRAY',
  { value: unknown[]; mode?: SQLArrayMode }
>;

export const SQLArray = sqlToken<
  SQLArray,
  unknown[] | { value: unknown[]; mode?: SQLArrayMode }
>('SQL_ARRAY', (input) => {
  if (Array.isArray(input)) {
    return { value: input };
  }
  return input.mode !== undefined
    ? { value: input.value, mode: input.mode }
    : { value: input.value };
});

export type SQLIn = SQLToken<
  'SQL_IN',
  { column: SQLIdentifier; values: SQLArray; mode?: SQLArrayMode }
>;

export const SQLIn = sqlToken<
  SQLIn,
  { column: string; values: unknown[]; mode?: SQLArrayMode }
>('SQL_IN', ({ column, values, mode }) =>
  mode !== undefined
    ? {
        column: SQLIdentifier.from(column),
        values: SQLArray.from(values),
        mode,
      }
    : {
        column: SQLIdentifier.from(column),
        values: SQLArray.from(values),
      },
);

export type SQLDefaultTokens = SQLIdentifier | SQLPlain | SQLLiteral | SQLArray;
export type SQLDefaultTokensTypes = SQLDefaultTokens['sqlTokenType'];
