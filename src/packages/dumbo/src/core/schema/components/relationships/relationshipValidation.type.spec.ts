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
  ExtractColumnNames,
  ExtractSchemaNames,
  ExtractTableNames,
  RelationshipDefinition,
} from './relationshipTypes';

const { database, schema, table, column } = dumboSchema;
const { Varchar } = SQL.column.type;

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

const _db1 = database('test', {
  public: schema('public', {
    users: table('users', {
      columns: {
        id: column('id', Varchar('max')),
        email: column('email', Varchar('max')),
      },
    }),
  }),
});

type _Result1 = AllColumnReferences<typeof _db1>;
type _Test7 = Expect<Equal<_Result1, 'public.users.id' | 'public.users.email'>>;

const _db2 = database('test', {
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
});

type _Result2 = AllColumnReferences<typeof _db2>;
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

const _db3 = database('test', {
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
});

type _Result3 = AllColumnReferences<typeof _db3>;
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
  ValidateDatabaseRelationships,
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

import type { ValidateRelationshipColumns } from './relationshipValidation';

type _FK_InvalidColumn = {
  columns: ['user_id', 'invalid_col'];
  references: ['public.users.id', 'public.users.tenant_id'];
};

type _Result_InvalidColumn = ValidateRelationshipColumns<
  _FK_InvalidColumn,
  'id' | 'email' | 'user_id'
>;
type _Test16 = Expect<IsError<_Result_InvalidColumn>>;

type _FK_ValidColumns = {
  columns: ['user_id'];
  references: ['public.users.id'];
};

type _FK_ValidCompositeColumns = {
  columns: ['user_id', 'email'];
  references: ['public.users.id', 'public.users.email'];
};

type _Result_ValidColumns = ValidateRelationshipColumns<
  _FK_ValidColumns,
  'id' | 'email' | 'user_id'
>;
type _Result_ValidCompositeColumns = ValidateRelationshipColumns<
  _FK_ValidCompositeColumns,
  'id' | 'email' | 'user_id'
>;
type _Test17 = Expect<Equal<_Result_ValidColumns, { valid: true }>>;
type _Test18 = Expect<Equal<_Result_ValidCompositeColumns, { valid: true }>>;

import type { ValidateRelationshipReferences } from './relationshipValidation';

type _FK_InvalidReference = {
  columns: ['user_id'];
  references: ['public.nonexistent.id'];
};

type _Result_InvalidReference = ValidateRelationshipReferences<
  _FK_InvalidReference,
  'public.users.id' | 'public.users.email' | 'public.posts.id'
>;
type _Test19 = Expect<IsError<_Result_InvalidReference>>;

type _FK_ValidReference = {
  columns: ['user_id'];
  references: ['public.users.id'];
};

type _FK_ValidCompositeReference = {
  columns: ['user_id', 'post_id'];
  references: ['public.users.id', 'public.posts.id'];
};

type _Result_ValidReference = ValidateRelationshipReferences<
  _FK_ValidReference,
  'public.users.id' | 'public.users.email' | 'public.posts.id'
>;
type _Result_ValidCompositeReference = ValidateRelationshipReferences<
  _FK_ValidCompositeReference,
  'public.users.id' | 'public.users.email' | 'public.posts.id'
>;
type _Test20 = Expect<Equal<_Result_ValidReference, { valid: true }>>;
type _Test21 = Expect<Equal<_Result_ValidCompositeReference, { valid: true }>>;

import type { ValidateSingleRelationship } from './relationshipValidation';

type _FK_Complete_Valid = {
  columns: ['user_id'];
  references: ['public.users.id'];
};

type _Result_Complete_Valid = ValidateSingleRelationship<
  _FK_Complete_Valid,
  'id' | 'user_id',
  'public.users.id' | 'public.users.email'
>;
type _Test22 = Expect<Equal<_Result_Complete_Valid, { valid: true }>>;

type _FK_Complete_LengthError = {
  columns: ['user_id', 'tenant_id'];
  references: ['public.users.id'];
};

type _Result_Complete_LengthError = ValidateSingleRelationship<
  _FK_Complete_LengthError,
  'id' | 'user_id' | 'tenant_id',
  'public.users.id' | 'public.users.email'
>;
type _Test23 = Expect<IsError<_Result_Complete_LengthError>>;

type _FK_Complete_ColumnError = {
  columns: ['invalid_col'];
  references: ['public.users.id'];
};

type _Result_Complete_ColumnError = ValidateSingleRelationship<
  _FK_Complete_ColumnError,
  'id' | 'user_id',
  'public.users.id' | 'public.users.email'
>;
type _Test24 = Expect<IsError<_Result_Complete_ColumnError>>;

type _FK_Complete_ReferenceError = {
  columns: ['user_id'];
  references: ['public.invalid.id'];
};

type _Result_Complete_ReferenceError = ValidateSingleRelationship<
  _FK_Complete_ReferenceError,
  'id' | 'user_id',
  'public.users.id' | 'public.users.email'
>;
type _Test24A = Expect<
  Equal<
    _Result_Complete_ReferenceError,
    {
      valid: false;
      error:
        | 'Invalid foreign key references: public.invalid.id. Available references: public.users.id'
        | 'Invalid foreign key references: public.invalid.id. Available references: public.users.email';
    }
  >
>;

import type { ValidateRelationship } from './relationshipValidation';

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

type _Result_FKRecord_Mixed = ValidateRelationship<
  _FKRecord_Mixed,
  'id' | 'user_id',
  'public.users.id' | 'public.users.email'
>;

type _Test25A = Expect<
  Equal<
    _Result_FKRecord_Mixed,
    {
      valid: false;
      error:
        | 'Invalid foreign key columns: invalid_col. Available columns: user_id'
        | 'Invalid foreign key columns: invalid_col. Available columns: id';
    }
  >
>;
type _Test35 = Expect<IsError<_Result_FKRecord_Mixed>>;

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

type _Result_FKRecord_AllValid = ValidateRelationship<
  _FKRecord_AllValid,
  'id' | 'user_id' | 'email',
  'public.users.id' | 'public.users.email'
>;
type _ValidateRelationshipRecordResult_InvalidFK = ValidateRelationship<
  {
    invalid_fk: {
      columns: ['invalid'];
      references: ['public.users.id'];
      type: 'one-to-many';
    };
  },
  'id' | 'user_id',
  'public.users.id' | 'public.users.email'
>;
type _TestValidateRelationshipRecordResult_InvalidFK = Expect<
  IsError<_ValidateRelationshipRecordResult_InvalidFK>
>;

import type { ValidateTableRelationships } from './relationshipValidation';

type _Table_NoFKs = TableSchemaComponent<{
  id: AnyColumnSchemaComponent;
  email: AnyColumnSchemaComponent;
}>;

type _Result_NoFKs = ValidateTableRelationships<
  _Table_NoFKs,
  'public.users.id' | 'public.users.email'
>;
type _Test26 = Expect<Equal<_Result_NoFKs, { valid: true }>>;

type _Table_SingleFK = TableSchemaComponent<
  {
    id: AnyColumnSchemaComponent;
    user_id: AnyColumnSchemaComponent;
  },
  {
    author: {
      columns: ['user_id'];
      references: ['public.users.id'];
      type: 'one-to-many';
    };
  }
>;

type _Result_SingleFK = ValidateTableRelationships<
  _Table_SingleFK,
  'public.users.id' | 'public.users.email'
>;
type _Test27 = Expect<Equal<_Result_SingleFK, { valid: true }>>;

type _Table_MultipleFK = TableSchemaComponent<
  {
    id: AnyColumnSchemaComponent;
    user_id: AnyColumnSchemaComponent;
    author_id: AnyColumnSchemaComponent;
  },
  {
    user: {
      columns: ['user_id'];
      references: ['public.users.id'];
      type: 'one-to-many';
    };
    author: {
      columns: ['author_id'];
      references: ['public.users.id'];
      type: 'one-to-many';
    };
  }
>;

type _Result_MultipleFK = ValidateTableRelationships<
  _Table_MultipleFK,
  'public.users.id' | 'public.users.email'
>;
type _Test28 = Expect<Equal<_Result_MultipleFK, { valid: true }>>;

type _Table_InvalidFK = TableSchemaComponent<
  {
    id: AnyColumnSchemaComponent;
    user_id: AnyColumnSchemaComponent;
  },
  {
    user: {
      readonly columns: ['id'];
      references: readonly ['public.users.id'];
      type: 'one-to-many';
    };
  }
>;

type _Result_InvalidFK = ValidateTableRelationships<
  _Table_InvalidFK,
  'public.posts.id' | 'public.users.email'
>;
type _Test29 = Expect<IsError<_Result_InvalidFK>>;

import type { ValidateSchemaRelationships } from './relationshipValidation';

type _Schema_MultiTable = DatabaseSchemaSchemaComponent<{
  users: TableSchemaComponent<{
    id: AnyColumnSchemaComponent;
    email: AnyColumnSchemaComponent;
  }>;
  posts: TableSchemaComponent<
    {
      id: AnyColumnSchemaComponent;
      user_id: AnyColumnSchemaComponent;
    },
    {
      user: {
        columns: ['user_id'];
        references: ['public.users.id'];
        type: 'one-to-many';
      };
    }
  >;
}>;

type _Result_Schema_Valid = ValidateSchemaRelationships<
  _Schema_MultiTable,
  'public.users.id' | 'public.users.email' | 'public.posts.id'
>;
type _Test30 = Expect<Equal<_Result_Schema_Valid, { valid: true }>>;

type _Schema_WithError = DatabaseSchemaSchemaComponent<{
  posts: TableSchemaComponent<
    {
      id: AnyColumnSchemaComponent;
      user_id: AnyColumnSchemaComponent;
    },
    {
      user: {
        columns: ['user_id'];
        references: ['public.users.id'];
        type: 'one-to-many';
      };
    }
  >;
}>;

type _Result_Schema_Error = ValidateSchemaRelationships<
  _Schema_WithError,
  'public.posts.id' | 'public.users.email'
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
          references: ['public.users.id'],
          type: 'one-to-many',
        },
      },
    }),
  }),
});

type _Test_ValidateSchemasInDatabaseResult_DbError = Expect<
  IsError<typeof _dbWithErrorVSInDB>
>;

const _fullDb = database('test', {
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
});

type _Result_FullDb = ValidateDatabaseRelationships<typeof _fullDb>;
type _Test32 = Expect<Equal<_Result_FullDb, { valid: true }>>;

const _dbWithSelfRef = database('test', {
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
});

type _Result_SelfRef = ValidateDatabaseRelationships<typeof _dbWithSelfRef>;
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
>; // This should PASS
