export type SQLToken<
  TSymbol extends string = string,
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint, @typescript-eslint/no-explicit-any
  TProps extends any = any,
> = {
  sqlTokenType: TSymbol;
  value: TProps;
};

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

  factory.check = (value: unknown): value is SQLTokenType =>
    SQLToken.check(value) && value.sqlTokenType === sqlTokenType;

  return factory;
};

SQLToken.check = (value: unknown): value is SQLToken =>
  value !== null && typeof value === 'object' && 'sqlTokenType' in value;

export type SQLIdentifier = SQLToken<'SQL_IDENTIFIER', string>;
export const SQLIdentifier = SQLToken<SQLIdentifier>('SQL_IDENTIFIER');

export type SQLPlain = SQLToken<'SQL_RAW', string>;
export const SQLPlain = SQLToken<SQLPlain>('SQL_RAW');

export type SQLLiteral = SQLToken<'SQL_LITERAL', unknown>;
export const SQLLiteral = SQLToken<SQLLiteral>('SQL_LITERAL');

export type SQLArray = SQLToken<'SQL_ARRAY', unknown[]>;
export const SQLArray = SQLToken<SQLArray>('SQL_ARRAY');

export type SQLDefaultTokens = SQLIdentifier | SQLPlain | SQLLiteral | SQLArray;
export type SQLDefaultTokensTypes = SQLDefaultTokens['sqlTokenType'];

export type SQLIn = SQLToken<
  'SQL_IN',
  { column: SQLIdentifier; values: unknown[] }
>;
export const SQLIn = SQLToken<SQLIn>('SQL_IN');
