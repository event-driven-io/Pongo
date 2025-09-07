export type SQLToken<
  TSymbol extends string = string,
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = {
  sqlTokenType: TSymbol;
} & TProps;

export const SQLToken = <SQLTokenType extends SQLToken>(
  sqlTokenType: SQLTokenType['sqlTokenType'],
) => {
  const factory = (props: Omit<SQLTokenType, 'sqlTokenType'>): SQLTokenType => {
    return {
      sqlTokenType: sqlTokenType,
      [sqlTokenType]: true,
      ...props,
    } as SQLTokenType;
  };

  factory.is = (value: unknown): value is SQLTokenType =>
    SQLToken.is(sqlTokenType, value);

  return factory;
};

SQLToken.is = <SQLTokenType extends SQLToken>(
  sqlToken: SQLTokenType['sqlTokenType'],
  value: unknown,
): value is SQLTokenType =>
  value !== null && typeof value === 'object' && sqlToken in value;

export type SQLIdentifier = SQLToken<'SQL_IDENTIFIER', { value: string }>;
export const SQLIdentifier = SQLToken<SQLIdentifier>('SQL_IDENTIFIER');

export type SQLPlain = SQLToken<'SQL_RAW', { value: string }>;
export const SQLPlain = SQLToken<SQLPlain>('SQL_RAW');

export type SQLLiteral = SQLToken<'SQL_LITERAL', { value: unknown }>;
export const SQLLiteral = SQLToken<SQLLiteral>('SQL_LITERAL');

export type SQLArray = SQLToken<'SQL_ARRAY', { values: unknown[] }>;
export const SQLArray = SQLToken<SQLArray>('SQL_ARRAY');

export type SQLDefaultTokens = SQLIdentifier | SQLPlain | SQLLiteral | SQLArray;
export type SQLDefaultTokensTypes = SQLDefaultTokens['sqlTokenType'];

export type SQLIn = SQLToken<
  'SQL_IN',
  { column: SQLIdentifier; values: unknown[] }
>;
export const SQLIn = SQLToken<SQLIn>('SQL_IN');
