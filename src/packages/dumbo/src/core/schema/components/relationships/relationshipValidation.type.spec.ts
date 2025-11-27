import type {
  AnyColumnSchemaComponent,
  AnyDatabaseSchemaComponent,
  AnyDatabaseSchemaSchemaComponent,
  AnyTableSchemaComponent,
  DatabaseSchemaComponent,
  DatabaseSchemaSchemaComponent,
  TableSchemaComponent,
} from '..';
import { SQL } from '../../../sql';
import type { Equal, Expect } from '../../../testing';
import { dumboSchema } from '../../dumboSchema';
import type {
  AllColumnReferences,
  AllColumnTypes,
  ExtractColumnNames,
  ExtractColumnTypeName,
  ExtractSchemaNames,
  ExtractTableNames,
  RelationshipDefinition,
} from './relationshipTypes';

const { database, schema, table, column } = dumboSchema;
const { Varchar, Integer } = SQL.column.type;

type _DB1 = DatabaseSchemaComponent<{
  public: AnyDatabaseSchemaSchemaComponent;
}>;
type _Test1 = Expect<Equal<ExtractSchemaNames<_DB1>, 'public'>>;

type _DB2 = DatabaseSchemaComponent<{
  public: AnyDatabaseSchemaSchemaComponent;
  analytics: AnyDatabaseSchemaSchemaComponent;
}>;
type _Test2 = Expect<Equal<ExtractSchemaNames<_DB2>, 'public' | 'analytics'>>;

type _Schema1 = DatabaseSchemaSchemaComponent<{
  users: AnyTableSchemaComponent;
}>;
type _Test3 = Expect<Equal<ExtractTableNames<_Schema1>, 'users'>>;

type _Schema2 = DatabaseSchemaSchemaComponent<{
  users: AnyTableSchemaComponent;
  posts: AnyTableSchemaComponent;
  comments: AnyTableSchemaComponent;
}>;
type _Test4 = Expect<
  Equal<ExtractTableNames<_Schema2>, 'users' | 'posts' | 'comments'>
>;

type _Table1 = TableSchemaComponent<{
  id: AnyColumnSchemaComponent;
}>;
type _Test5 = Expect<Equal<ExtractColumnNames<_Table1>, 'id'>>;

type _Table2 = TableSchemaComponent<{
  id: AnyColumnSchemaComponent;
  email: AnyColumnSchemaComponent;
  name: AnyColumnSchemaComponent;
  created_at: AnyColumnSchemaComponent;
}>;
type _Test6 = Expect<
  Equal<ExtractColumnNames<_Table2>, 'id' | 'email' | 'name' | 'created_at'>
>;

const _db1Schemas = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Varchar('max')),
        email: column('email', Varchar('max')),
      },
    }),
  }),
};

type _Result1 = AllColumnReferences<typeof _db1Schemas>;
type _Test7 = Expect<Equal<_Result1, 'public.users.id' | 'public.users.email'>>;

const _db2Schemas = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Varchar('max')),
        email: column('email', Varchar('max')),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Varchar('max')),
        title: column('title', Varchar('max')),
        user_id: column('user_id', Varchar('max')),
      },
    }),
  }),
};

type _Result2 = AllColumnReferences<typeof _db2Schemas>;
type _Test8 = Expect<
  Equal<
    _Result2,
    | 'public.users.id'
    | 'public.users.email'
    | 'public.posts.id'
    | 'public.posts.title'
    | 'public.posts.user_id'
  >
>;

const _db3Schemas = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Varchar('max')),
        email: column('email', Varchar('max')),
      },
    }),
  }),
  analytics: schema('analytics', {
    events: table('events', {
      columns: {
        id: column('id', Varchar('max')),
        user_id: column('user_id', Varchar('max')),
        event_type: column('event_type', Varchar('max')),
      },
    }),
  }),
};

type _Result3 = AllColumnReferences<typeof _db3Schemas>;
type _Test9 = Expect<
  Equal<
    _Result3,
    | 'public.users.id'
    | 'public.users.email'
    | 'analytics.events.id'
    | 'analytics.events.user_id'
    | 'analytics.events.event_type'
  >
>;

const _validFK: RelationshipDefinition = {
  columns: ['user_id'],
  references: ['public.users.id'],
  type: 'one-to-one',
};

type _ColumnsType = typeof _validFK.columns;
type _Test10 = Expect<Equal<_ColumnsType, readonly string[]>>;

const _compositeFK: RelationshipDefinition = {
  columns: ['user_id', 'tenant_id'],
  references: ['public.users.id', 'public.users.tenant_id'],
  type: 'one-to-one',
};

type _CompositeColumnsType = typeof _compositeFK.columns;
type _CompositeReferencesType = typeof _compositeFK.references;
type _Test11 = Expect<Equal<_CompositeColumnsType, readonly string[]>>;
type _Test12 = Expect<Equal<_CompositeReferencesType, readonly string[]>>;

import type { IsError } from '../../../testing/typesTesting';
import type {
  NormalizeReferences,
  ValidateDatabaseSchema,
  ValidateDatabaseSchemas,
  ValidateRelationship,
  ValidateRelationshipLength,
} from './relationshipValidation';

type _FK_LengthMismatch = {
  columns: ['user_id', 'tenant_id'];
  references: ['public.users.id'];
};

type _Result_LengthMismatch = ValidateRelationshipLength<_FK_LengthMismatch>;
type _Test13 = Expect<IsError<_Result_LengthMismatch>>;

type _FK_SingleMatch = {
  columns: ['user_id'];
  references: ['public.users.id'];
};

type _FK_CompositeMatch = {
  columns: ['user_id', 'tenant_id'];
  references: ['public.users.id', 'public.users.tenant_id'];
};

type _Result_SingleMatch = ValidateRelationshipLength<_FK_SingleMatch>;
type _Result_CompositeMatch = ValidateRelationshipLength<_FK_CompositeMatch>;
type _Test14 = Expect<Equal<_Result_SingleMatch, { valid: true }>>;
type _Test15 = Expect<Equal<_Result_CompositeMatch, { valid: true }>>;

type _MockTableColumns = {
  id: { type: typeof Integer; name: 'id' };
  user_id: { type: typeof Integer; name: 'user_id' };
  tenant_id: { type: typeof Integer; name: 'tenant_id' };
};

const _MockTableColumns2 = {
  id: column('id', Integer),
  user_id: column('user_id', Integer),
  email: column('email', Varchar('max')),
};

// type _FK_InvalidColumn = RelationshipDefinition<
//   ['user_id', 'invalid_col'],
//   ['public.users.id', 'public.users.tenant_id'],
//   'one-to-one'
// >;

// type _Result_InvalidColumn = ValidateRelationshipColumns<
//   typeof _MockTableColumns2,
//   _FK_InvalidColumn
// >;
// type _Test16 = Expect<IsError<_Result_InvalidColumn>>;

// type _FK_ValidColumns = {
//   columns: ['user_id'];
//   references: ['public.users.id'];
// };

// type _FK_ValidCompositeColumns = {
//   columns: ['user_id', 'email'];
//   references: ['public.users.id', 'public.users.email'];
// };

// type _Result_ValidColumns = ValidateRelationshipColumns<
//   _FK_ValidColumns,
//   'id' | 'email' | 'user_id'
// >;
// type _Result_ValidCompositeColumns = ValidateRelationshipColumns<
//   _FK_ValidCompositeColumns,
//   'id' | 'email' | 'user_id'
// >;
// type _Test17 = Expect<Equal<_Result_ValidColumns, { valid: true }>>;
// type _Test18 = Expect<Equal<_Result_ValidCompositeColumns, { valid: true }>>;

// import type { ValidateRelationshipReferences } from './relationshipValidation';

// type _FK_InvalidReference = {
//   columns: ['user_id'];
//   references: ['public.nonexistent.id'];
// };

// type _Result_InvalidReference = ValidateRelationshipReferences<
//   _FK_InvalidReference,
//   'public.users.id' | 'public.users.email' | 'public.posts.id',
//   'public',
//   'posts'
// >;
// type _Test19 = Expect<IsError<_Result_InvalidReference>>;

// type _FK_ValidReference = {
//   columns: ['user_id'];
//   references: ['public.users.id'];
// };

// type _FK_ValidCompositeReference = {
//   columns: ['user_id', 'post_id'];
//   references: ['public.users.id', 'public.posts.id'];
// };

// type _Result_ValidReference = ValidateRelationshipReferences<
//   _FK_ValidReference,
//   'public.users.id' | 'public.users.email' | 'public.posts.id',
//   'public',
//   'posts'
// >;
// type _Result_ValidCompositeReference = ValidateRelationshipReferences<
//   _FK_ValidCompositeReference,
//   'public.users.id' | 'public.users.email' | 'public.posts.id',
//   'public',
//   'posts'
// >;
// type _Test20 = Expect<Equal<_Result_ValidReference, { valid: true }>>;
// type _Test21 = Expect<Equal<_Result_ValidCompositeReference, { valid: true }>>;

// import type { ValidateRelationship } from './relationshipValidation';

// type _FK_Complete_Valid = {
//   columns: ['user_id'];
//   references: ['public.users.id'];
// };

// type _Result_Complete_Valid = ValidateRelationship<
//   _FK_Complete_Valid,
//   _MockTableColumns,
//   'public.users.id' | 'public.users.email',
//   _AllColumnTypes2,
//   'public',
//   'posts'
// >;
// type _Test22 = Expect<Equal<_Result_Complete_Valid, { valid: true }>>;

// type _FK_Complete_LengthError = {
//   columns: ['user_id', 'tenant_id'];
//   references: ['public.users.id'];
// };

// type _Result_Complete_LengthError = ValidateRelationship<
//   _FK_Complete_LengthError,
//   _MockTableColumns,
//   'public.users.id' | 'public.users.email',
//   _AllColumnTypes2,
//   'public',
//   'posts'
// >;
// type _Test23 = Expect<IsError<_Result_Complete_LengthError>>;

// type _FK_Complete_ColumnError = {
//   columns: ['invalid_col'];
//   references: ['public.users.id'];
// };

// type _Result_Complete_ColumnError = ValidateRelationship<
//   _FK_Complete_ColumnError,
//   _MockTableColumns,
//   'public.users.id' | 'public.users.email',
//   _AllColumnTypes2,
//   'public',
//   'posts'
// >;
// type _Test24 = Expect<IsError<_Result_Complete_ColumnError>>;

// type _FK_Complete_ReferenceError = {
//   columns: ['user_id'];
//   references: ['public.invalid.id'];
// };

// type _Result_Complete_ReferenceError = ValidateRelationship<
//   _FK_Complete_ReferenceError,
//   _MockTableColumns,
//   'public.users.id' | 'public.users.email',
//   _AllColumnTypes2,
//   'public',
//   'posts'
// >;
// type _Test24A = Expect<
//   Equal<
//     _Result_Complete_ReferenceError,
//     {
//       valid: false;
//       error:
//         | 'Invalid foreign key references: public.invalid.id. Available references: public.users.id'
//         | 'Invalid foreign key references: public.invalid.id. Available references: public.users.email';
//     }
//   >
// >;

type _MockTableColumns2Type = typeof _MockTableColumns2;

// type _Test35 = Expect<IsError<_Result_FKRecord_Mixed>>;

type _FKRecord_AllValid = {
  user_fk: {
    columns: ['user_id'];
    references: ['public.users.id'];
    type: 'one-to-many';
  };
  email_fk: {
    columns: ['email'];
    references: ['public.users.email'];
    type: 'one-to-many';
  };
};

type _FKRecord_Mixed = {
  user_fk: {
    columns: ['user_id'];
    references: ['public.users.id'];
    type: 'one-to-many';
  };
  invalid_fk: {
    columns: ['invalid_col'];
    references: ['public.users.email'];
    type: 'one-to-many';
  };
};

// type UsersTable = TableSchemaComponent<_MockTableColumns2Type, 'users'>;

// type MixedColumnsTable = TableSchemaComponent<
//   _MockTableColumns2Type,
//   'posts',
//   _FKRecord_Mixed
// >;

// type _Result_FKRecord_Mixed = ValidateTableRelationships<
//   MixedColumnsTable,
//   { posts: MixedColumnsTable, users: TableSchemaComponent<{ },
//   { public: MixedColumnsTable },
//   _MockTableColumns2,
//   'public.users.id' | 'public.users.email',
//   _AllColumnTypes2,
//   'public',
//   'posts'
// >;

// type _Result_FKRecord_AllValid = ValidateTableRelationships<
//   _FKRecord_AllValid,
//   _MockTableColumns2,
//   'public.users.id' | 'public.users.email',
//   _AllColumnTypes2,
//   'public',
//   'posts'
// >;
// type _ValidateRelationshipRecordResult_InvalidFK = ValidateTableRelationships<
//   {
//     invalid_fk: {
//       columns: ['invalid'];
//       references: ['public.users.id'];
//       type: 'one-to-many';
//     };
//   },
//   _MockTableColumns2,
//   'public.users.id' | 'public.users.email',
//   _AllColumnTypes2,
//   'public',
//   'posts'
// >;
// type _TestValidateRelationshipRecordResult_InvalidFK = Expect<
//   IsError<_ValidateRelationshipRecordResult_InvalidFK>
// >;

// import type { ValidateTable } from './relationshipValidation';

// type _Table_NoFKs = TableSchemaComponent<
//   {
//     id: AnyColumnSchemaComponent;
//     email: AnyColumnSchemaComponent;
//   },
//   'users'
// >;

// type _Result_NoFKs = ValidateTable<_Table_NoFKs>;
// type _Test26 = Expect<Equal<_Result_NoFKs, { valid: true }>>;

// type _Table_SingleFK = TableSchemaComponent<
//   {
//     id: AnyColumnSchemaComponent;
//     user_id: AnyColumnSchemaComponent;
//   },
//   'posts',
//   {
//     author: {
//       columns: ['user_id'];
//       references: ['public.users.id'];
//       type: 'one-to-many';
//     };
//   }
// >;

// type _Result_SingleFK = ValidateTable<
//   _Table_SingleFK,
//   'public.users.id' | 'public.users.email',
//   _AllColumnTypes2,
//   'public',
//   'posts'
// >;

// type _Table_MultipleFK = TableSchemaComponent<
//   {
//     id: AnyColumnSchemaComponent;
//     user_id: AnyColumnSchemaComponent;
//     author_id: AnyColumnSchemaComponent;
//   },
//   'posts',
//   {
//     user: {
//       columns: ['user_id'];
//       references: ['public.users.id'];
//       type: 'one-to-many';
//     };
//     author: {
//       columns: ['author_id'];
//       references: ['public.users.id'];
//       type: 'one-to-many';
//     };
//   }
// >;

// type _Result_MultipleFK = ValidateTable<
//   _Table_MultipleFK,
//   'public.users.id' | 'public.users.email',
//   _AllColumnTypes2,
//   'public',
//   'posts'
// >;

type _Table_InvalidFK = TableSchemaComponent<
  {
    id: AnyColumnSchemaComponent;
    user_id: AnyColumnSchemaComponent;
  },
  'posts',
  {
    user: {
      readonly columns: ['id'];
      references: readonly ['public.users.id'];
      type: 'one-to-many';
    };
  }
>;

type _Schema_MultiTable = DatabaseSchemaSchemaComponent<
  {
    users: TableSchemaComponent<
      {
        id: AnyColumnSchemaComponent;
        email: AnyColumnSchemaComponent;
      },
      'users'
    >;
    posts: TableSchemaComponent<
      {
        id: AnyColumnSchemaComponent;
        user_id: AnyColumnSchemaComponent;
      },
      'posts',
      {
        user: {
          columns: ['user_id'];
          references: ['public.users.id'];
          type: 'one-to-many';
        };
      }
    >;
  },
  'public'
>;

type _Result_Schema_Valid = ValidateDatabaseSchema<
  _Schema_MultiTable,
  { readonly public: _Schema_MultiTable }
>;

type _Test30 = Expect<Equal<_Result_Schema_Valid, { valid: true }>>;

type _Schema_WithError = DatabaseSchemaSchemaComponent<
  {
    posts: TableSchemaComponent<
      {
        id: AnyColumnSchemaComponent;
        user_id: AnyColumnSchemaComponent;
      },
      'posts',
      {
        user: {
          columns: ['user_id'];
          references: ['public.users.id'];
          type: 'one-to-many';
        };
      }
    >;
  },
  'public'
>;

type _Result_Schema_Error = ValidateDatabaseSchema<
  _Schema_WithError,
  { public: _Schema_WithError }
>;
type _Test31 = Expect<IsError<_Result_Schema_Error>>;

const _dbWithErrorVSInDB = database('test', {
  public: schema('public', {
    posts: table('posts', {
      columns: {
        id: column('id', Varchar('max')),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: {
        invalid: {
          columns: ['id'],
          references: ['public.posts.id'],
          type: 'one-to-many',
        },
      },
    }),
  }),
});

// type _Test_ValidateSchemasInDatabaseResult_DbError = Expect<
//   IsError<typeof _dbWithErrorVSInDB>
// >;

const _fullDbSchemas = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Varchar('max')),
        email: column('email', Varchar('max')),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Varchar('max')),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: {
        user: {
          type: 'many-to-one',
          columns: ['user_id'],
          references: ['public.users.id'],
        },
      },
    }),
  }),
} as const;
const _fullDb = database('test', _fullDbSchemas);
type FullDbSchemasType = typeof _fullDbSchemas;
type _AllColumnReferencesFDb = AllColumnReferences<FullDbSchemasType>;
type _AllColumnTypesFDb = AllColumnTypes<FullDbSchemasType>;

type _Result_FullDb = ValidateDatabaseSchemas<FullDbSchemasType>;
type _Test32 = Expect<Equal<_Result_FullDb, { valid: true }>>;

const _dbSchemasWithSelfRef = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Varchar('max')),
        manager_id: column('manager_id', Varchar('max')),
      },
      relationships: {
        manager: {
          columns: ['manager_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
};

const _dbWithSelfRef = database('test', _dbSchemasWithSelfRef);

type _Result_SelfRef = ValidateDatabaseSchemas<typeof _dbSchemasWithSelfRef>;
type _Test33 = Expect<Equal<_Result_SelfRef, { valid: true }>>;

const _dbWithError = database('test', {
  public: schema('public', {
    posts: table('posts', {
      columns: {
        id: column('id', Varchar('max')),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: {
        invalid: {
          columns: ['id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _Test34 = Expect<IsError<typeof _dbWithError>>;

// TEST: Invalid column should cause type error at database() call
const _dbInvalidColumn = database('test', {
  public: schema('public', {
    posts: table('posts', {
      columns: {
        id: column('id', Varchar('max')),
        user_id: column('id', Varchar('max')),
      },
      relationships: {
        invalid: {
          columns: ['id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _InvalidColResult = typeof _dbInvalidColumn;
type _Test_InvalidColumn = Expect<IsError<_InvalidColResult>>;

// TEST: Valid FK should work
const _dbValid = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: { id: column('id', Varchar('max')) },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Varchar('max')),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _ValidResult = typeof _dbValid;
type _Test_Valid = Expect<
  Equal<_ValidResult extends AnyDatabaseSchemaComponent ? true : false, true>
>;

type _VarcharMaxToken = ReturnType<typeof Varchar>;
type _Test_ExtractVarcharTypeName = Expect<
  Equal<ExtractColumnTypeName<_VarcharMaxToken>, 'VARCHAR'>
>;

type _IntegerToken = typeof SQL.column.type.Integer;
type _Test_ExtractIntegerTypeName = Expect<
  Equal<ExtractColumnTypeName<_IntegerToken>, 'INTEGER'>
>;

type _BigIntegerToken = typeof SQL.column.type.BigInteger;
type _Test_ExtractBigIntegerTypeName = Expect<
  Equal<ExtractColumnTypeName<_BigIntegerToken>, 'BIGINT'>
>;

const _dbForTypesSchema1 = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Varchar('max')),
        email: column('email', Varchar('max')),
      },
    }),
  }),
};

const _dbForTypes1 = database('test', _dbForTypesSchema1);

type _AllColumnTypes1 = AllColumnTypes<typeof _dbForTypesSchema1>;
type _Test_AllColumnTypes_SingleTable = Expect<
  Equal<
    _AllColumnTypes1,
    {
      public: {
        users: {
          id: { columnTypeName: 'VARCHAR' };
          email: { columnTypeName: 'VARCHAR' };
        };
      };
    }
  >
>;

type _Test_AllColumnTypes_NestedAccess = Expect<
  Equal<_AllColumnTypes1['public']['users']['id']['columnTypeName'], 'VARCHAR'>
>;

const _dbForTypes2Schema = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        email: column('email', Varchar('max')),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        title: column('title', Varchar('max')),
        user_id: column('user_id', Integer),
      },
    }),
  }),
};
const _dbForTypes2 = database('test', _dbForTypes2Schema);

type _AllColumnTypes2 = AllColumnTypes<typeof _dbForTypes2Schema>;
type _Test_AllColumnTypes_MultiTable = Expect<
  Equal<
    _AllColumnTypes2,
    {
      public: {
        users: {
          id: { columnTypeName: 'INTEGER' };
          email: { columnTypeName: 'VARCHAR' };
        };
        posts: {
          id: { columnTypeName: 'INTEGER' };
          title: { columnTypeName: 'VARCHAR' };
          user_id: { columnTypeName: 'INTEGER' };
        };
      };
    }
  >
>;

import type { LookupColumnType, ParseReferencePath } from './relationshipTypes';

type _Test_ParsePublicUsersId = Expect<
  Equal<
    ParseReferencePath<'public.users.id'>,
    { schema: 'public'; table: 'users'; column: 'id' }
  >
>;

type _Test_ParseAnalyticsEventsUserId = Expect<
  Equal<
    ParseReferencePath<'analytics.events.user_id'>,
    { schema: 'analytics'; table: 'events'; column: 'user_id' }
  >
>;

type _Test_LookupColumnType_UsersId = Expect<
  Equal<LookupColumnType<_AllColumnTypes2, 'public.users.id'>, 'INTEGER'>
>;

type _Test_LookupColumnType_UsersEmail = Expect<
  Equal<LookupColumnType<_AllColumnTypes2, 'public.users.email'>, 'VARCHAR'>
>;

type _Test_LookupColumnType_PostsUserId = Expect<
  Equal<LookupColumnType<_AllColumnTypes2, 'public.posts.user_id'>, 'INTEGER'>
>;

type _Test_LookupColumnType_PostsTitle = Expect<
  Equal<LookupColumnType<_AllColumnTypes2, 'public.posts.title'>, 'VARCHAR'>
>;

import type {
  RelationshipValidationError,
  TypeMismatchError,
} from './relationshipValidation';

type _TestTypeMismatchError = {
  type: 'type_mismatch';
  column: 'user_id';
  expectedType: 'VARCHAR';
  actualType: 'INTEGER';
  reference: 'public.users.id';
};

type _Test_TypeMismatchErrorStructure = Expect<
  Equal<
    TypeMismatchError,
    {
      type: 'type_mismatch';
      column: string;
      expectedType: string;
      actualType: string;
      reference: string;
    }
  >
>;

type _Test_TypeMismatchAssignable = Expect<
  Equal<_TestTypeMismatchError extends TypeMismatchError ? true : false, true>
>;

type _TestLengthMismatchError = {
  type: 'length_mismatch';
  columnsLength: 2;
  referencesLength: 1;
};

type _Test_LengthMismatchAssignable = Expect<
  Equal<
    _TestLengthMismatchError extends RelationshipValidationError ? true : false,
    true
  >
>;

type _TestInvalidColumnError = {
  type: 'invalid_column';
  column: 'invalid_col';
  availableColumns: 'id | user_id';
};

type _Test_InvalidColumnAssignable = Expect<
  Equal<
    _TestInvalidColumnError extends RelationshipValidationError ? true : false,
    true
  >
>;

type _TestInvalidReferenceError = {
  type: 'invalid_reference';
  reference: 'public.nonexistent.id';
  availableReferences: 'public.users.id | public.users.email';
};

type _Test_InvalidReferenceAssignable = Expect<
  Equal<
    _TestInvalidReferenceError extends RelationshipValidationError
      ? true
      : false,
    true
  >
>;

type _Test_TypeMismatchIsValidError = Expect<
  Equal<
    _TestTypeMismatchError extends RelationshipValidationError ? true : false,
    true
  >
>;

import type { CompareTypes } from './relationshipValidation';

type _Test_CompareTypes_VarcharMatch = Expect<
  Equal<CompareTypes<'VARCHAR', 'VARCHAR'>, true>
>;

type _Test_CompareTypes_VarcharCaseInsensitive = Expect<
  Equal<CompareTypes<'varchar', 'VARCHAR'>, true>
>;

type _Test_CompareTypes_IntegerDoesNotMatchVarchar = Expect<
  Equal<CompareTypes<'INTEGER', 'VARCHAR'>, false>
>;

type _Test_CompareTypes_IntegerDoesNotMatchBigint = Expect<
  Equal<CompareTypes<'INTEGER', 'BIGINT'>, false>
>;

import type {
  ValidateColumnTypePair,
  ValidationResult,
} from './relationshipValidation';

type _IntegerColumn = {
  type: typeof Integer;
  name: 'user_id';
};

type _VarcharColumn = {
  type: ReturnType<typeof Varchar>;
  name: 'user_id';
};

type _Test_ValidateColumnTypePair_Match = Expect<
  Equal<
    ValidateColumnTypePair<
      _IntegerColumn,
      'user_id',
      'public.users.id',
      _AllColumnTypes2,
      'public',
      'posts'
    >,
    ValidationResult<true>
  >
>;

type _Test_ValidateColumnTypePair_Mismatch = Expect<
  Equal<
    ValidateColumnTypePair<
      _VarcharColumn,
      'user_id',
      'public.users.id',
      _AllColumnTypes2,
      'public',
      'posts'
    >,
    ValidationResult<
      false,
      {
        type: 'type_mismatch';
        column: 'user_id';
        expectedType: 'INTEGER';
        actualType: 'VARCHAR';
        reference: 'public.users.id';
      }
    >
  >
>;

const _dbTypeMismatchSchema = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        email: column('email', Varchar('max')),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

type _DbWithTypeMismatch = DatabaseSchemaComponent<
  typeof _dbTypeMismatchSchema
>;
type _ValidationResult_TypeMismatch = ValidateDatabaseSchemas<
  typeof _dbTypeMismatchSchema
>;
type _Test_TypeMismatch_Detected = Expect<
  IsError<_ValidationResult_TypeMismatch>
>;

const _dbWithTypeMatch = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        email: column('email', Varchar('max')),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _Test_TypeMatch_Valid = Expect<
  Equal<
    typeof _dbWithTypeMatch extends AnyDatabaseSchemaComponent ? true : false,
    true
  >
>;

const _dbCompositeTypeMismatchSchema = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        tenant_id: column('tenant_id', Integer),
        email: column('email', Varchar('max')),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Integer),
        tenant_id: column('tenant_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id', 'tenant_id'],
          references: ['public.users.id', 'public.users.tenant_id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

type _DbWithCompositeTypeMismatch = DatabaseSchemaComponent<
  typeof _dbCompositeTypeMismatchSchema
>;
type _ValidationResult_CompositeTypeMismatch = ValidateDatabaseSchemas<
  typeof _dbCompositeTypeMismatchSchema
>;
type _Test_CompositeTypeMismatch_Detected = Expect<
  IsError<_ValidationResult_CompositeTypeMismatch>
>;

const _dbWithCompositeTypeMatch = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        tenant_id: column('tenant_id', Integer),
        email: column('email', Varchar('max')),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Integer),
        tenant_id: column('tenant_id', Integer),
      },
      relationships: {
        user: {
          columns: ['user_id', 'tenant_id'],
          references: ['public.users.id', 'public.users.tenant_id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _Test_CompositeTypeMatch_Valid = Expect<
  Equal<
    typeof _dbWithCompositeTypeMatch extends AnyDatabaseSchemaComponent
      ? true
      : false,
    true
  >
>;

import type {
  FormatError,
  FormatTypeMismatchError,
} from './relationshipValidation';

type _SampleTypeMismatchError = {
  type: 'type_mismatch';
  column: 'user_id';
  expectedType: 'INTEGER';
  actualType: 'VARCHAR';
  reference: 'public.users.id';
};

type _Test_FormatTypeMismatchError = Expect<
  Equal<
    FormatTypeMismatchError<_SampleTypeMismatchError>,
    'Column user_id has type VARCHAR but public.users.id has type INTEGER'
  >
>;

type _Test_FormatError_TypeMismatch = Expect<
  Equal<
    FormatError<_SampleTypeMismatchError>,
    'Column user_id has type VARCHAR but public.users.id has type INTEGER'
  >
>;

type _Test_FormatError_String = Expect<
  Equal<
    FormatError<'Invalid foreign key columns: invalid_col. Available columns: id | user_id'>,
    'Invalid foreign key columns: invalid_col. Available columns: id | user_id'
  >
>;

const _dbWithTypeMismatchForFormatting = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

type _DbForFormatting = DatabaseSchemaComponent<
  typeof _dbWithTypeMismatchForFormatting
>;
type _ValidationResultForFormatting = ValidateDatabaseSchemas<
  typeof _dbWithTypeMismatchForFormatting
>;
type _Test_ValidationDetectsError = Expect<
  IsError<_ValidationResultForFormatting>
>;

const _dbWithFormattedError = database(
  'test',
  _dbWithTypeMismatchForFormatting,
);

type _FormattedErrorResult = typeof _dbWithFormattedError;
type _Test_FormattedErrorStructure = Expect<
  Equal<
    _FormattedErrorResult,
    {
      valid: false;
      error: 'Column user_id has type VARCHAR but public.users.id has type INTEGER';
    }
  >
>;

const _dbCompositePartialMismatch = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        tenant_id: column('tenant_id', Integer),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Integer),
        tenant_id: column('tenant_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id', 'tenant_id'],
          references: ['public.users.id', 'public.users.tenant_id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

const _dbCompositePartialMismatchResult = database(
  'test',
  _dbCompositePartialMismatch,
);

type _Test_CompositePartialMismatch = Expect<
  IsError<typeof _dbCompositePartialMismatchResult>
>;

const _dbCompositeAllMismatch = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        tenant_id: column('tenant_id', Integer),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Varchar('max')),
        tenant_id: column('tenant_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id', 'tenant_id'],
          references: ['public.users.id', 'public.users.tenant_id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

const _dbCompositeAllMismatchResult = database('test', _dbCompositeAllMismatch);

type _Test_CompositeAllMismatch = Expect<
  IsError<typeof _dbCompositeAllMismatchResult>
>;

type _Test_CompositeAllMismatchMessage = Expect<
  Equal<
    typeof _dbCompositeAllMismatchResult,
    {
      valid: false;
      error: 'Column user_id has type VARCHAR but public.users.id has type INTEGER; Column tenant_id has type VARCHAR but public.users.tenant_id has type INTEGER';
    }
  >
>;

const _dbSelfReferentialWithTypes = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        manager_id: column('manager_id', Integer),
      },
      relationships: {
        manager: {
          columns: ['manager_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _Test_SelfReferentialWithTypes_Valid = Expect<
  Equal<
    typeof _dbSelfReferentialWithTypes extends AnyDatabaseSchemaComponent
      ? true
      : false,
    true
  >
>;

const _dbMultipleFKsWithTypes = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Integer),
        author_id: column('author_id', Integer),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
        author: {
          columns: ['author_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _Test_MultipleFKsWithTypes_Valid = Expect<
  Equal<
    typeof _dbMultipleFKsWithTypes extends AnyDatabaseSchemaComponent
      ? true
      : false,
    true
  >
>;

const _dbCrossSchemaWithTypes = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
      },
    }),
  }),
  analytics: schema('analytics', {
    events: table('events', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _Test_CrossSchemaWithTypes_Valid = Expect<
  Equal<
    typeof _dbCrossSchemaWithTypes extends AnyDatabaseSchemaComponent
      ? true
      : false,
    true
  >
>;

const _dbSelfReferenceTypeMismatch = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        manager_id: column('manager_id', Varchar('max')),
      },
      relationships: {
        manager: {
          columns: ['manager_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

const _dbSelfReferenceTypeMismatchResult = database(
  'test',
  _dbSelfReferenceTypeMismatch,
);

type _Test_SelfReferenceTypeMismatch = Expect<
  IsError<typeof _dbSelfReferenceTypeMismatchResult>
>;

const _dbSingleFKTypeMismatch = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

const _dbSingleFKTypeMismatchResult = database('test', _dbSingleFKTypeMismatch);

type _Test_SingleFKTypeMismatch = Expect<
  IsError<typeof _dbSingleFKTypeMismatchResult>
>;

type _Test_SingleFKTypeMismatchMessage = Expect<
  Equal<
    typeof _dbSingleFKTypeMismatchResult,
    {
      valid: false;
      error: 'Column user_id has type VARCHAR but public.users.id has type INTEGER';
    }
  >
>;

const _dbMultipleFKsAllTypeMismatch = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Varchar('max')),
        author_id: column('author_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
        author: {
          columns: ['author_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

const _dbMultipleFKsAllTypeMismatchResult = database(
  'test',
  _dbMultipleFKsAllTypeMismatch,
);

type _Test_MultipleFKsAllTypeMismatch = Expect<
  IsError<typeof _dbMultipleFKsAllTypeMismatchResult>
>;

const _dbCrossSchemaTypeMismatch = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
      },
    }),
  }),
  analytics: schema('analytics', {
    events: table('events', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['public.users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

const _dbCrossSchemaTypeMismatchResult = database(
  'test',
  _dbCrossSchemaTypeMismatch,
);

type _Test_CrossSchemaTypeMismatch = Expect<
  IsError<typeof _dbCrossSchemaTypeMismatchResult>
>;

type _Test_CrossSchemaTypeMismatchMessage = Expect<
  Equal<
    typeof _dbCrossSchemaTypeMismatchResult,
    {
      valid: false;
      error: 'Column user_id has type VARCHAR but public.users.id has type INTEGER';
    }
  >
>;

const _dbSelfReferenceColumnOnly = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        manager_id: column('manager_id', Integer),
      },
      relationships: {
        manager: {
          columns: ['manager_id'],
          references: ['id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _Test_SelfReferenceColumnOnly_Valid = Expect<
  Equal<
    typeof _dbSelfReferenceColumnOnly extends AnyDatabaseSchemaComponent
      ? true
      : false,
    true
  >
>;

const _dbSelfReferenceColumnOnlyTypeMismatch = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
        manager_id: column('manager_id', Varchar('max')),
      },
      relationships: {
        manager: {
          columns: ['manager_id'],
          references: ['id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

const _dbSelfReferenceColumnOnlyTypeMismatchResult = database(
  'test',
  _dbSelfReferenceColumnOnlyTypeMismatch,
);

// Debug: Check what the result type is
type _Debug_SelfRefResult = typeof _dbSelfReferenceColumnOnlyTypeMismatchResult;

type _Test_SelfReferenceColumnOnlyTypeMismatch = Expect<
  IsError<typeof _dbSelfReferenceColumnOnlyTypeMismatchResult>
>;

const schefff = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
};

const _dbSameSchemaTableColumn = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Integer),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
});

type _Test_SameSchemaTableColumn_Valid = Expect<
  Equal<
    typeof _dbSameSchemaTableColumn extends AnyDatabaseSchemaComponent
      ? true
      : false,
    true
  >
>;

const _postsTable = table('posts', {
  columns: {
    id: column('id', Integer),
    user_id: column('user_id', Varchar('max')),
  },
  relationships: {
    user: {
      columns: ['user_id'],
      references: ['users.id'],
      type: 'many-to-one',
    },
  },
});

type postsTableNameType = typeof _postsTable.tableName;

type postsTableColumnsType =
  typeof _postsTable extends TableSchemaComponent<
    infer Columns,
    infer _TableName,
    infer _Relationships
  >
    ? Columns
    : never;

type postsTableRelationshipsType =
  typeof _postsTable extends TableSchemaComponent<
    infer _Columns,
    infer _TableName,
    infer _Relationships
  >
    ? _Relationships
    : never;

type rel1 = postsTableRelationshipsType['user'];

type schType = typeof schefff;

type rel2tabs = NormalizeReferences<
  rel1['references'],
  'public',
  'posts'
>[0] extends `${infer S}.${infer T}.${infer C}`
  ? { schema: S; table: T; column: C }
  : never;

type rel2norm = NormalizeReferences<
  rel1['references'],
  'public',
  'posts'
>[0] extends `${infer S}.${infer T}.${infer C}`
  ? S extends keyof schType
    ? T extends keyof schType[S]['tables']
      ? schType[S]['tables'][T] extends TableSchemaComponent<
          infer Columns,
          infer _TableName,
          infer _Relationships
        >
        ? Columns[C]
        : never
      : never
    : never
  : never;

type djdjd = schType['public']['tables']['users'];

const _dbSameSchemaTableColumnTypeMismatch = {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Integer),
      },
    }),
    posts: table('posts', {
      columns: {
        id: column('id', Integer),
        user_id: column('user_id', Varchar('max')),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['users.id'],
          type: 'many-to-one',
        },
      },
    }),
  }),
} as const;

type _Type_DbSameSchemaTableColumnTypeMismatch =
  typeof _dbSameSchemaTableColumnTypeMismatch;

type _PublicType = _Type_DbSameSchemaTableColumnTypeMismatch['public'];

type _PostsType =
  _Type_DbSameSchemaTableColumnTypeMismatch['public']['tables']['posts'];

type _ValidatioResult_Type_DbSameSchemaTableColumnTypeMismatch =
  ValidateRelationship<postsTableColumnsType, rel1, postsTableNameType>;

const _dbSameSchemaTableColumnTypeMismatchResult = database(
  'test',
  _dbSameSchemaTableColumnTypeMismatch,
);

// Debug: Check what the result type is
type _Debug_SameSchemaResult =
  typeof _dbSameSchemaTableColumnTypeMismatchResult;

type _Test_SameSchemaTableColumnTypeMismatch = Expect<
  IsError<typeof _dbSameSchemaTableColumnTypeMismatchResult>
>;
