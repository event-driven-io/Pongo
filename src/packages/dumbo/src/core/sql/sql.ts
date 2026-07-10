import { JSONSerializer } from '../serializer';
import type { dumboSchema } from '../schema/dumboSchema';
import { columnSchemaComponent } from '../schema/components/columnSchemaComponent';
import type { SQLFormatter } from './formatters';
import { describeSQL, formatSQL, type FormatSQLOptions } from './formatters';
import type { ParametrizedSQL } from './parametrizedSQL';
import { isTokenizedSQL, TokenizedSQL } from './tokenizedSQL';
import {
  SQLArray,
  SQLColumnToken,
  SQLColumnTypeTokensFactory,
  SQLIdentifier,
  SQLIn,
  SQLPlain,
  type SQLArrayMode,
} from './tokens';

/** A tokenized SQL statement created with the {@link SQL} template tag. */
export type SQL = string & { __brand: 'sql' };

export type SQLTag = {
  /**
   * Creates a tokenized SQL statement.
   *
   * Interpolated values are treated as bound parameters by default. Use the
   * helper methods on `SQL` for SQL syntax that cannot be represented as a bound
   * parameter, such as identifiers or trusted raw fragments.
   */
  (strings: TemplateStringsArray, ...values: unknown[]): SQL;

  /** Empty SQL statement used when optional query fragments are absent. */
  EMPTY: SQL;

  /** Concatenates SQL fragments without adding a separator. */
  concat: (...sqls: SQL[]) => SQL;

  /**
   * Merges SQL fragments, skipping empty fragments and inserting a separator
   * between non-empty fragments.
   */
  merge: (sqls: SQL[], separator?: string) => SQL;

  /** Formats SQL into a parametrized query and params using the selected formatter. */
  format: (
    sql: SQL | SQL[],
    formatter: SQLFormatter,
    options?: FormatSQLOptions,
  ) => ParametrizedSQL;

  /** Formats SQL into a readable SQL string for diagnostics and migrations. */
  describe: (
    sql: SQL | SQL[],
    formatter: SQLFormatter,
    options?: FormatSQLOptions,
  ) => string;

  /** Creates a SQL `IN`/native-array token for the provided column and values. */
  in: (
    column: string,
    values: unknown[],
    options?: { mode?: SQLArrayMode },
  ) => SQLIn;

  /** Creates an array token that formatters can render as native or expanded params. */
  array: (values: unknown[], options?: { mode?: SQLArrayMode }) => SQLArray;

  /** Creates a SQL identifier token, quoting it when required by SQL rules. */
  identifier: typeof SQLIdentifier.from;

  /**
   * Creates a trusted raw SQL fragment.
   *
   * This does not quote, escape, or bind the value. Prefer bound parameters for
   * data values, `SQL.identifier` for identifiers, and `SQL.literal` only when
   * SQL syntax requires an inline value literal.
   */
  plain: typeof SQLPlain.from;

  /**
   * Creates an inline SQL value literal.
   *
   * Use this for SQL syntax positions that cannot use bound parameters. Data
   * values in ordinary queries should stay as template interpolations.
   */
  literal: (value: string) => SQLPlain;

  /** Type guards and helpers for SQL tokens. */
  check: {
    isSQL: (value: unknown) => value is SQL;
    isTokenizedSQL: (value: unknown) => value is TokenizedSQL;
    isEmpty: (sql: SQL) => boolean;
    isIdentifier: typeof SQLIdentifier.check;
    isPlain: typeof SQLPlain.check;
    isSQLIn: typeof SQLIn.check;
  };

  /** Creates a schema column token for SQL generation. */
  column: typeof SQLColumnToken.from & {
    /** Column type token factory. */
    type: typeof SQLColumnTypeTokensFactory;
  };

  /** Creates a schema column token using Dumbo schema metadata. */
  columnN: typeof dumboSchema.column & {
    /** Column type token factory. */
    type: typeof SQLColumnTypeTokensFactory;
  };
};

const createSQL = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): SQL => {
  const parametrized = TokenizedSQL(strings, values);
  return parametrized as unknown as SQL;
};

/**
 * Creates SQL by interpolating values directly into the statement.
 *
 * Prefer {@link SQL} for query execution. `RawSQL` is for trusted SQL text that
 * is already safe to inline.
 */
export function RawSQL(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SQL {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += String(values[i]);
    }
  }

  return {
    __brand: 'tokenized-sql',
    sqlChunks: [result],
    sqlTokens: [],
  } as unknown as SQL;
}

/** Returns true when the value is a tokenized SQL statement. */
export const isSQL = (value: unknown): value is SQL => {
  if (value === undefined || value === null) {
    return false;
  }

  return isTokenizedSQL(value);
};

const emptySQL = {
  __brand: 'tokenized-sql',
  sqlChunks: [''],
  sqlTokens: [],
} satisfies TokenizedSQL as unknown as SQL;

const mergeSQL = (sqls: SQL[], separator: string = ' '): SQL => {
  const parametrized = sqls
    .filter((sql) => !isEmpty(sql))
    .map((sql) => sql as unknown as TokenizedSQL);

  const params = parametrized.flatMap((p) => p.sqlTokens);
  const sqlChunks = parametrized.flatMap((p, i) =>
    i == parametrized.length - 1 || separator === ''
      ? p.sqlChunks
      : [...p.sqlChunks, separator],
  );

  const merged: TokenizedSQL =
    sqlChunks.length > 0
      ? {
          __brand: 'tokenized-sql',
          sqlChunks: sqlChunks,
          sqlTokens: params,
        }
      : TokenizedSQL.empty;

  return merged as unknown as SQL;
};

const concatSQL = (...sqls: SQL[]): SQL => mergeSQL(sqls, '');

const literal = (value: string): SQLPlain =>
  SQLPlain.from(`'${value.replace(/'/g, "''")}'`);

const isEmpty = (sql: SQL): boolean => {
  if (isTokenizedSQL(sql)) {
    const parametrized = sql as unknown as TokenizedSQL;
    return (
      parametrized.sqlChunks.every((chunk) => chunk.trim() === '') &&
      parametrized.sqlTokens.length === 0
    );
  }

  return false;
};

const columnFactory: typeof SQLColumnToken.from & {
  type: typeof SQLColumnTypeTokensFactory;
} = SQLColumnToken.from as unknown as typeof SQLColumnToken.from & {
  type: typeof SQLColumnTypeTokensFactory;
};
columnFactory.type = SQLColumnTypeTokensFactory;

const schemaColumnFactory = ((name: string, type: unknown, options?: object) =>
  columnSchemaComponent({
    columnName: name,
    type,
    ...options,
  } as never)) as typeof dumboSchema.column;

export const SQL: SQLTag = Object.assign(createSQL, {
  EMPTY: emptySQL,
  concat: concatSQL,
  merge: mergeSQL,
  format: (
    sql: SQL | SQL[],
    formatter: SQLFormatter,
    options?: FormatSQLOptions,
  ): ParametrizedSQL =>
    formatSQL(sql, formatter, options?.serializer ?? JSONSerializer, options),
  describe: (
    sql: SQL | SQL[],
    formatter: SQLFormatter,
    options?: FormatSQLOptions,
  ): string =>
    describeSQL(sql, formatter, options?.serializer ?? JSONSerializer, options),
  in: (
    column: string,
    values: unknown[],
    options?: { mode?: SQLArrayMode },
  ): SQLIn =>
    options?.mode
      ? SQLIn.from({ column, values, mode: options.mode })
      : SQLIn.from({ column, values }),
  array: (values: unknown[], options?: { mode?: SQLArrayMode }): SQLArray =>
    SQLArray.from(
      options?.mode ? { value: values, mode: options.mode } : values,
    ),
  identifier: SQLIdentifier.from,
  plain: SQLPlain.from,
  literal,
  check: {
    isSQL,
    isTokenizedSQL: (value: unknown): value is TokenizedSQL =>
      isTokenizedSQL(value),
    isEmpty,
    isIdentifier: SQLIdentifier.check,
    isPlain: SQLPlain.check,
    isSQLIn: SQLIn.check,
  },
  column: columnFactory,
  columnN: Object.assign(schemaColumnFactory, {
    type: SQLColumnTypeTokensFactory,
  }),
});
