import { JSONSerializer } from '../serializer';
import { isParametrizedSQL, type ParametrizedSQL } from './parametrizedSQL';
import { SQL, isSQL, type SQLIn } from './sql';

export interface ParametrizedQuery {
  query: string;
  params: unknown[];
}

export interface SQLFormatter {
  formatIdentifier: (value: unknown) => string;
  formatLiteral: (value: unknown) => string;
  formatString: (value: unknown) => string;
  mapBoolean?: (value: boolean) => unknown;
  formatBoolean?: (value: boolean) => string;
  formatArray?: (
    array: unknown[],
    itemFormatter: (item: unknown) => string,
  ) => string;
  mapArray?: (
    array: unknown[],
    itemFormatter: (item: unknown) => unknown,
  ) => unknown[];
  mapDate?: (value: Date) => unknown;
  formatDate?: (value: Date) => string;
  formatObject?: (value: object) => string;
  formatBigInt?: (value: bigint) => string;
  formatSQLIn?: (
    column: string,
    values: unknown[],
    placeholderGenerator: (index: number) => string,
    startIndex: number,
  ) => { sql: string; params: unknown[] };
  mapSQLValue: (value: unknown) => unknown;
  format: (sql: SQL | SQL[]) => ParametrizedQuery;
  formatRaw: (sql: SQL | SQL[]) => string;
  placeholderGenerator: (index: number) => string;
}
const formatters: Record<string, SQLFormatter> = {};

export const registerFormatter = (
  dialect: string,
  formatter: SQLFormatter,
): void => {
  formatters[dialect] = formatter;
};

export const getFormatter = (dialect: string): SQLFormatter => {
  const formatterKey = dialect;
  if (!formatters[formatterKey]) {
    throw new Error(`No SQL formatter registered for dialect: ${dialect}`);
  }
  return formatters[formatterKey];
};

export const formatSQLRaw = (
  _sql: SQL | SQL[],
  _formatter: SQLFormatter,
): string => 'TODO';

function formatSQLValue(value: unknown, formatter: SQLFormatter): string {
  if (SQL.check.isIdentifier(value)) {
    return formatter.formatIdentifier(value.value);
  }
  if (SQL.check.isPlain(value)) {
    return value.value;
  }
  if (SQL.check.isLiteral(value)) {
    return formatter.formatLiteral(value.value);
  }
  if (SQL.check.isSQLIn(value)) {
    return formatSQLIn(value, formatter);
  }

  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (Array.isArray(value) && formatter.formatArray) {
    return formatter.formatArray
      ? formatter.formatArray(value, (item) => formatSQLValue(item, formatter))
      : formatter.formatLiteral(value);
  }
  if (typeof value === 'boolean') {
    return formatter.formatBoolean
      ? formatter.formatBoolean(value)
      : value
        ? 'TRUE'
        : 'FALSE';
  }
  if (typeof value === 'bigint') {
    return formatter.formatBigInt
      ? formatter.formatBigInt(value)
      : value.toString();
  }
  if (value instanceof Date && formatter.formatDate) {
    return formatter.formatDate(value);
  }
  if (typeof value === 'object') {
    return formatter.formatObject
      ? formatter.formatObject(value)
      : formatter.formatLiteral(value);
  }

  return formatter.formatLiteral(value);
}

export function mapSQLValue(value: unknown, formatter: SQLFormatter): unknown {
  if (SQL.check.isIdentifier(value)) {
    return formatter.formatIdentifier(value.value);
  }
  if (SQL.check.isPlain(value)) {
    return value.value;
  }
  if (SQL.check.isLiteral(value)) {
    return formatter.formatLiteral(value.value);
  }
  if (isSQL(value)) {
    return formatSQLRaw(value, formatter);
  }

  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return formatter.mapArray
      ? formatter.mapArray(value, (item) => mapSQLValue(item, formatter))
      : value.map((item) => mapSQLValue(item, formatter));
  }
  if (typeof value === 'boolean') {
    return formatter.mapBoolean
      ? formatter.mapBoolean(value)
      : value
        ? 'TRUE'
        : 'FALSE';
  }
  if (typeof value === 'bigint') {
    return formatter.formatBigInt
      ? formatter.formatBigInt(value)
      : value.toString();
  }
  if (value instanceof Date && formatter.mapDate) {
    return formatter.mapDate(value);
  }
  if (typeof value === 'object') {
    return formatter.formatObject
      ? formatter.formatObject(value)
      : `'${JSONSerializer.serialize(value).replace(/'/g, "''")}'`;
  }

  return formatter.formatLiteral(value);
}

function formatSQLIn(sqlIn: SQLIn, formatter: SQLFormatter): string {
  const { column, values } = sqlIn;

  if (values.length === 0) {
    return 'TRUE';
  }

  const formattedColumn = formatter.formatIdentifier(column);
  const formattedValues = values
    .map((v) => formatSQLValue(v, formatter))
    .join(', ');
  return `${formattedColumn} IN (${formattedValues})`;
}

const processSQLValue = (
  sqlChunk: string,
  value: unknown,
  {
    formatter,
    builder,
  }: { formatter: SQLFormatter; builder: ParametrizedQueryBuilder },
): void => {
  const mapBoolean = (value: boolean) => {
    builder.addParam(
      formatter.mapBoolean
        ? formatter.mapBoolean(value)
        : value
          ? 'TRUE'
          : 'FALSE',
    );
  };

  const expandSQLIn = (value: SQLIn) => {
    const { values: inValues, column } = value;

    if (inValues.length === 0) {
      mapBoolean(false);
      return;
    }

    builder.addParams([column]);
    builder.addSQL(` IN `);

    expandArray(inValues);
  };

  const expandArray = (value: unknown[]) => {
    if (value.length === 0) {
      throw new Error(
        'Empty arrays in IN clauses are not supported. Use SQL.in(column, array) helper instead.',
      );
    }

    const mappedValues = formatter.mapArray
      ? formatter.mapArray(value, (item) => mapSQLValue(item, formatter))
      : value.map((item) => mapSQLValue(item, formatter));

    builder.addParams(mappedValues);
  };

  builder.addSQL(sqlChunk);

  if (value === null || value === undefined) {
    builder.addParam(null);
  } else if (typeof value === 'number') {
    builder.addParam(value);
  } else if (typeof value === 'string') {
    builder.addParam(value);
  } else if (Array.isArray(value)) {
    expandArray(value);
  } else if (typeof value === 'boolean') {
    mapBoolean(value);
  } else if (typeof value === 'bigint') {
    builder.addParam(
      formatter.formatBigInt ? formatter.formatBigInt(value) : value.toString(),
    );
  } else if (value instanceof Date && formatter.mapDate) {
    builder.addParam(formatter.mapDate(value));
  } else if (typeof value === 'object') {
    builder.addParam(
      formatter.formatObject
        ? formatter.formatObject(value)
        : `'${JSONSerializer.serialize(value).replace(/'/g, "''")}'`,
    );
  } else if (SQL.check.isLiteral(value)) {
    builder.addParam(formatter.formatLiteral(value.value));
  } else if (SQL.check.isIdentifier(value)) {
    builder.addSQL(formatter.formatIdentifier(value.value));
  } else if (SQL.check.isSQLIn(value)) {
    expandSQLIn(value);
  } else {
    builder.addParam(formatter.formatLiteral(value));
  }
};

export function formatSQL(
  sql: SQL | SQL[],
  formatter: SQLFormatter,
): ParametrizedQuery {
  const merged = (Array.isArray(sql)
    ? SQL.merge(sql, '\n')
    : sql) as unknown as ParametrizedSQL;

  if (!isParametrizedSQL(merged)) {
    throw new Error('Expected ParametrizedSQL, got string-based SQL');
  }

  const builder = ParametrizedQueryBuilder({
    placeholderGenerator: formatter.placeholderGenerator,
  });

  for (let i = 0; i < merged.params.length; i++) {
    processSQLValue(merged.sqlChunks[i]!, merged.params[i], {
      formatter,
      builder,
    });
  }

  return builder.build();
}

export type ParametrizedQueryBuilder = {
  addSQL: (str: string) => ParametrizedQueryBuilder;
  addParam(value: unknown): ParametrizedQueryBuilder;
  addParams(values: unknown[]): ParametrizedQueryBuilder;
  build: () => ParametrizedQuery;
};

const ParametrizedQueryBuilder = ({
  placeholderGenerator,
}: {
  placeholderGenerator: (index: number) => string;
}): ParametrizedQueryBuilder => {
  const sql: string[] = [];
  const params: unknown[] = [];

  return {
    addSQL(str: string): ParametrizedQueryBuilder {
      sql.push(str);
      return this;
    },
    addParam(value: unknown): ParametrizedQueryBuilder {
      sql.push(placeholderGenerator(params.length));
      params.push(value);
      return this;
    },
    addParams(values: unknown[]): ParametrizedQueryBuilder {
      const placeholders = values.map((_, i) =>
        placeholderGenerator(params.length + i),
      );
      this.addSQL(`(${placeholders.join(', ')})`);
      params.push(...values);
      return this;
    },
    build(): ParametrizedQuery {
      return {
        query: sql.join(''),
        params,
      };
    },
  };
};
