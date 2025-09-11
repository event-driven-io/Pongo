import { SQLArray, SQLLiteral, SQLPlain, SQLToken } from './tokens';

export type TokenizedSQL = Readonly<{
  __brand: 'tokenized-sql';
  sqlChunks: ReadonlyArray<string>;
  sqlTokens: ReadonlyArray<SQLToken>;
}>;

const TokenizedSQLBuilder = () => {
  const sqlChunks: string[] = [];
  const sqlTokens: SQLToken[] = [];

  return {
    addSQL(str: string): void {
      sqlChunks.push(str);
    },
    addSQLs(str: ReadonlyArray<string>): void {
      sqlChunks.push(...str);
    },
    addToken(value: SQLToken): void {
      sqlTokens.push(value);
    },
    addTokens(vals: ReadonlyArray<SQLToken>): void {
      sqlTokens.push(...vals);
    },
    build(): TokenizedSQL {
      return sqlChunks.length > 0
        ? {
            __brand: 'tokenized-sql',
            sqlChunks,
            sqlTokens,
          }
        : TokenizedSQL.empty;
    },
  };
};

export const TokenizedSQL = (
  strings: ReadonlyArray<string>,
  values: unknown[],
): TokenizedSQL => {
  const builder = TokenizedSQLBuilder();

  for (let i = 0; i < strings.length; i++) {
    if (strings[i] !== '') builder.addSQL(strings[i]!);

    if (i >= values.length) break;

    const value = values[i];

    if (isTokenizedSQL(value)) {
      builder.addSQLs(value.sqlChunks);
      builder.addTokens(value.sqlTokens);
    } else if (SQLPlain.check(value)) {
      builder.addSQL(value.value);
    } else {
      builder.addSQL(TokenizedSQL.paramPlaceholder);
      builder.addToken(
        SQLToken.check(value)
          ? value
          : Array.isArray(value)
            ? SQLArray.from(value)
            : SQLLiteral.from(value),
      );
    }
  }

  return builder.build();
};

export const isTokenizedSQL = (value: unknown): value is TokenizedSQL => {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__brand' in value &&
    value.__brand === 'tokenized-sql'
  );
};

TokenizedSQL.paramPlaceholder = `__P__`;

TokenizedSQL.empty = {
  __brand: 'tokenized-sql',
  sqlChunks: [''],
  sqlTokens: [],
} satisfies TokenizedSQL;
