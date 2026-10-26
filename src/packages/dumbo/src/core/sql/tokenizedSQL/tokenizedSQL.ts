import {
  SQLArray,
  SQLLiteral,
  SQLPlain,
  SQLToken,
  type AnySQLToken,
} from '../tokens';
import { withProps } from '../../utils/withProps';

export type TokenizedSQL = Readonly<{
  __brand: 'tokenized-sql';
  sqlChunks: ReadonlyArray<string>;
  sqlTokens: ReadonlyArray<AnySQLToken>;
}>;

const TokenizedSQLBuilder = () => {
  const sqlChunks: string[] = [];
  const sqlTokens: AnySQLToken[] = [];

  return {
    addSQL(str: string): void {
      sqlChunks.push(str);
    },
    addSQLs(str: ReadonlyArray<string>): void {
      sqlChunks.push(...str);
    },
    addToken(value: AnySQLToken): void {
      sqlTokens.push(value);
    },
    addTokens(vals: ReadonlyArray<AnySQLToken>): void {
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

const tokenizedSQL = (
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

export const TokenizedSQL = withProps(tokenizedSQL, {
  paramPlaceholder: `__P__`,
  empty: {
    __brand: 'tokenized-sql',
    sqlChunks: [''],
    sqlTokens: [],
  } satisfies TokenizedSQL,
});
