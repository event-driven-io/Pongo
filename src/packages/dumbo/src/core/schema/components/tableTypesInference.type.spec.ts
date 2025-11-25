import { SQL } from '../../sql';
import type {
  BigIntegerToken,
  BigSerialToken,
  IntegerToken,
  JSONBToken,
  SerialToken,
  TimestampToken,
  TimestamptzToken,
  VarcharToken,
} from '../../sql/tokens/columnTokens';
import type { Equals, Expect } from '../../testing';
import { dumboSchema } from '../dumboSchema';
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
type _Test1 = Expect<Equals<InferColumnType<SerialToken>, number>>;
type _Test2 = Expect<Equals<InferColumnType<BigSerialToken>, bigint>>;
type _Test3 = Expect<Equals<InferColumnType<IntegerToken>, number>>;
type _Test4 = Expect<Equals<InferColumnType<BigIntegerToken>, bigint>>;
type _Test5 = Expect<Equals<InferColumnType<VarcharToken>, string>>;
type _Test6 = Expect<Equals<InferColumnType<TimestampToken>, Date>>;
type _Test7 = Expect<Equals<InferColumnType<TimestamptzToken>, Date>>;

// InferColumnValueType - JSONB with custom type
type CustomType = { foo: string; bar: number };
type _Test8 = Expect<
  Equals<InferColumnType<JSONBToken<CustomType>>, CustomType>
>;

// InferColumnType - primary key is non-nullable
const _idColumn = column('id', Serial, { primaryKey: true });
type _Test9 = Expect<Equals<TableColumnType<typeof _idColumn>, number>>;

// InferColumnType - notNull is non-nullable
const _emailColumn = column('email', Varchar(255), { notNull: true });
type _Test10 = Expect<Equals<TableColumnType<typeof _emailColumn>, string>>;

// InferColumnType - default column is nullable
const _nicknameColumn = column('nickname', Varchar(100));
type _Test11 = Expect<
  Equals<TableColumnType<typeof _nicknameColumn>, string | null>
>;

// InferColumnType - column with default is still nullable
const _createdAtColumn = column('createdAt', Timestamp, {
  default: SQL.plain(`NOW()`),
});
type _Test12 = Expect<
  Equals<TableColumnType<typeof _createdAtColumn>, Date | null>
>;

// InferColumnType - unique column is nullable
const _usernameColumn = column('username', Varchar(50), { unique: true });
type _Test13 = Expect<
  Equals<TableColumnType<typeof _usernameColumn>, string | null>
>;

// InferColumnType - serial without primary key is nullable
const _sortOrderColumn = column('sortOrder', Serial);
type _Test14 = Expect<
  Equals<TableColumnType<typeof _sortOrderColumn>, number | null>
>;

// InferColumnType - bigint types
const _bigIdColumn = column('bigId', BigSerial, { primaryKey: true });
const _nullableBigIntColumn = column('bigValue', BigInteger);
type _Test15 = Expect<Equals<TableColumnType<typeof _bigIdColumn>, bigint>>;
type _Test16 = Expect<
  Equals<TableColumnType<typeof _nullableBigIntColumn>, bigint | null>
>;

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
type _Test17 = Expect<
  Equals<
    UserRow,
    {
      id: number;
      email: string;
      nickname: string | null;
      age: number | null;
      createdAt: Date | null;
      username: string | null;
    }
  >
>;

// InferTableType - infer from TableSchemaComponent
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
type _Test18 = Expect<
  Equals<
    ProductRow,
    {
      id: bigint;
      name: string;
      description: string | null;
      price: number;
      metadata: { tags: string[] } | null;
    }
  >
>;

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
type _Test19 = Expect<
  Equals<
    StrictRow,
    {
      id: number;
      field1: string;
      field2: number;
      field3: Date;
    }
  >
>;

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
type _Test20 = Expect<
  Equals<
    NullableRow,
    {
      id: number;
      field1: string | null;
      field2: number | null;
      field3: Date | null;
    }
  >
>;
