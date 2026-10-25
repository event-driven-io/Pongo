import { expectTypeOf, it } from 'vitest';
import { SQL } from '../../../sql';
import type {
  BigIntegerToken,
  BigSerialToken,
  IntegerToken,
  JSONBToken,
  SerialToken,
  TimestampToken,
  TimestamptzToken,
  VarcharToken,
} from '../../../sql/tokens/columnTokens';
import { dumboSchema } from '../../dumboSchema';
import type {
  InferColumnType,
  InferTableRow,
  TableColumnType,
  TableRowType,
} from './tableTypesInference';

const { table, column } = dumboSchema;
const { Serial, BigSerial, Integer, BigInteger, Varchar, Timestamp, JSONB } =
  SQL.column.type;

// InferColumnValueType - basic types
it('infers serial as number', () => {
  expectTypeOf<InferColumnType<SerialToken>>().toEqualTypeOf<number>();
});
it('infers big serial as bigint', () => {
  expectTypeOf<InferColumnType<BigSerialToken>>().toEqualTypeOf<bigint>();
});
it('infers integer as number', () => {
  expectTypeOf<InferColumnType<IntegerToken>>().toEqualTypeOf<number>();
});
it('infers big integer as bigint', () => {
  expectTypeOf<InferColumnType<BigIntegerToken>>().toEqualTypeOf<bigint>();
});
it('infers varchar as string', () => {
  expectTypeOf<InferColumnType<VarcharToken>>().toEqualTypeOf<string>();
});
it('infers timestamp as Date', () => {
  expectTypeOf<InferColumnType<TimestampToken>>().toEqualTypeOf<Date>();
});
it('infers timestamptz as Date', () => {
  expectTypeOf<InferColumnType<TimestamptzToken>>().toEqualTypeOf<Date>();
});

// InferColumnValueType - JSONB with custom type
type CustomType = { foo: string; bar: number };
it('preserves custom JSONB types', () => {
  expectTypeOf<
    InferColumnType<JSONBToken<CustomType>>
  >().toEqualTypeOf<CustomType>();
});

// InferColumnType - primary key is non-nullable
const _idColumn = column('id', Serial, { primaryKey: true });
it('makes primary keys non-nullable', () => {
  expectTypeOf<TableColumnType<typeof _idColumn>>().toEqualTypeOf<number>();
});

// InferColumnType - notNull is non-nullable
const _emailColumn = column('email', Varchar(255), { notNull: true });
it('makes notNull columns non-nullable', () => {
  expectTypeOf<TableColumnType<typeof _emailColumn>>().toEqualTypeOf<string>();
});

// InferColumnType - default column is nullable
const _nicknameColumn = column('nickname', Varchar(100));
it('makes default columns nullable', () => {
  expectTypeOf<TableColumnType<typeof _nicknameColumn>>().toEqualTypeOf<
    string | null
  >();
});

// InferColumnType - column with default is still nullable
const _createdAtColumn = column('createdAt', Timestamp, {
  default: SQL.plain(`NOW()`),
});
it('keeps columns with defaults nullable', () => {
  expectTypeOf<
    TableColumnType<typeof _createdAtColumn>
  >().toEqualTypeOf<Date | null>();
});

// InferColumnType - unique column is nullable
const _usernameColumn = column('username', Varchar(50), { unique: true });
it('keeps unique columns nullable', () => {
  expectTypeOf<TableColumnType<typeof _usernameColumn>>().toEqualTypeOf<
    string | null
  >();
});

// InferColumnType - serial without primary key is nullable
const _sortOrderColumn = column('sortOrder', Serial);
it('keeps serial columns without primary keys nullable', () => {
  expectTypeOf<TableColumnType<typeof _sortOrderColumn>>().toEqualTypeOf<
    number | null
  >();
});

// InferColumnType - bigint types
const _bigIdColumn = column('bigId', BigSerial, { primaryKey: true });
const _nullableBigIntColumn = column('bigValue', BigInteger);
it('infers bigint primary keys', () => {
  expectTypeOf<TableColumnType<typeof _bigIdColumn>>().toEqualTypeOf<bigint>();
});
it('infers nullable bigint columns', () => {
  expectTypeOf<TableColumnType<typeof _nullableBigIntColumn>>().toEqualTypeOf<
    bigint | null
  >();
});

// InferTableRow - complex table with mixed nullability
const _usersColumns = {
  id: column('id', Serial, { primaryKey: true }),
  email: column('email', Varchar(255), { notNull: true }),
  nickname: column('nickname', Varchar(100)),
  age: column('age', Integer),
  createdAt: column('createdAt', Timestamp, { default: SQL.plain(`NOW()`) }),
  username: column('username', Varchar(50), { unique: true }),
};
const _usersTable = table('users', {
  columns: _usersColumns,
});
type UserRow = InferTableRow<typeof _usersColumns>;
it('infers table rows with mixed nullability', () => {
  expectTypeOf<UserRow>().toEqualTypeOf<{
    id: number;
    email: string;
    nickname: string | null;
    age: number | null;
    createdAt: Date | null;
    username: string | null;
  }>();
});

// InferTableType - infer from TableComponent
const _productsTable = table('products', {
  columns: {
    id: column('id', BigSerial, { primaryKey: true }),
    name: column('name', Varchar(255), { notNull: true }),
    description: column('description', Varchar('max')),
    price: column('price', Integer, { notNull: true }),
    metadata: column('metadata', JSONB<{ tags: string[] }>()),
  },
});
type ProductRow = TableRowType<typeof _productsTable>;
it('infers rows from table components', () => {
  expectTypeOf<ProductRow>().toEqualTypeOf<{
    id: bigint;
    name: string;
    description: string | null;
    price: number;
    metadata: { tags: string[] } | null;
  }>();
});

// InferTableType - table with all non-nullable columns
const _strictTable = table('strict', {
  columns: {
    id: column('id', Serial, { primaryKey: true }),
    field1: column('field1', Varchar(100), { notNull: true }),
    field2: column('field2', Integer, { notNull: true }),
    field3: column('field3', Timestamp, { notNull: true }),
  },
});
type StrictRow = TableRowType<typeof _strictTable>;
it('infers tables with non-nullable columns', () => {
  expectTypeOf<StrictRow>().toEqualTypeOf<{
    id: number;
    field1: string;
    field2: number;
    field3: Date;
  }>();
});

// InferTableType - table with all nullable columns (except PK)
const _nullableTable = table('nullable', {
  columns: {
    id: column('id', Serial, { primaryKey: true }),
    field1: column('field1', Varchar(100)),
    field2: column('field2', Integer),
    field3: column('field3', Timestamp),
  },
});
type NullableRow = TableRowType<typeof _nullableTable>;
it('infers tables with nullable columns', () => {
  expectTypeOf<NullableRow>().toEqualTypeOf<{
    id: number;
    field1: string | null;
    field2: number | null;
    field3: Date | null;
  }>();
});
