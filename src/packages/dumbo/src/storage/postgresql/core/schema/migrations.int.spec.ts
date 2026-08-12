import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import assert from 'assert';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { PostgreSQLConnectionString, tableExists } from '..';
import { dumbo, type Dumbo } from '../../../..';
import {
  count,
  databaseComponent,
  databaseSchemaKey,
  databaseSchemaComponent,
  dumboSchema,
  indexComponent,
  jsonDocumentIndexTarget,
  MIGRATIONS_LOCK_ID,
  runSQLMigrations,
  extensionComponent,
  single,
  SQL,
  SQLDefaultSchemaNameToken,
  sqlMigration,
  tableComponent,
  type SQLMigration,
} from '../../../../core';
import { pgDumboDriver } from '../../pg';
import { acquireAdvisoryLock, releaseAdvisoryLock } from '../locks';

describe('Migration Integration Tests', () => {
  let pool: Dumbo;
  let postgres: StartedPostgreSqlContainer;
  let connectionString: PostgreSQLConnectionString;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = PostgreSQLConnectionString(postgres.getConnectionUri());
    pool = dumbo({ connectionString, driver: pgDumboDriver });
  });

  afterAll(async () => {
    await pool.close();
    await postgres.stop();
  });

  beforeEach(async () => {
    await pool.execute.query(
      SQL`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`,
    );
  });

  it('should apply multiple migrations sequentially', async () => {
    const firstMigration: SQLMigration = {
      name: 'initial_setup',
      sqls: [
        SQL`
                CREATE TABLE users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );`,
      ],
    };

    const secondMigration: SQLMigration = {
      name: 'add_roles_table',
      sqls: [
        SQL`
                CREATE TABLE roles (
                    id SERIAL PRIMARY KEY,
                    role_name VARCHAR(255) NOT NULL UNIQUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );`,
      ],
    };

    await runSQLMigrations(pool, [firstMigration, secondMigration], {
      lock: { options: { timeoutMs: 300 } },
    });

    const usersTableExists = await tableExists(pool.execute, 'users');
    const rolesTableExists = await tableExists(pool.execute, 'roles');

    assert.ok(usersTableExists, 'The users table should exist.');
    assert.ok(rolesTableExists, 'The roles table should exist.');
  });

  it('uses a schema-qualified custom migration table for all ledger operations', async () => {
    const migration = sqlMigration('custom-ledger:001', [
      SQL`CREATE TABLE custom_ledger_result (id TEXT PRIMARY KEY);`,
    ]);
    const options = {
      migrationTable: {
        schemaName: 'infra',
        tableName: 'app_migrations',
      },
    };

    const first = await runSQLMigrations(pool, [migration], options);
    const second = await runSQLMigrations(pool, [migration], options);
    const recorded = await count(
      pool.execute.query(
        SQL`SELECT COUNT(*) AS count FROM infra.app_migrations WHERE name = ${migration.name}`,
      ),
    );

    assert.deepStrictEqual(first.applied, [migration]);
    assert.deepStrictEqual(second.skipped, [migration]);
    assert.strictEqual(recorded, 1);
  });

  it('runs expanded database and schema feature component migrations in order', async () => {
    const schemaTableMigration = sqlMigration('schema-table:001', [
      SQL`CREATE TABLE component_users (id TEXT PRIMARY KEY);`,
    ]);
    const schemaFeatureMigration = sqlMigration('schema-feature:001', [
      SQL`CREATE TABLE schema_audit_log (id TEXT PRIMARY KEY);`,
    ]);
    const databaseFeatureMigration = sqlMigration('database-feature:001', [
      SQL`CREATE TABLE database_outbox (id TEXT PRIMARY KEY);`,
    ]);
    const audit = extensionComponent('audit', {
      migrations: () => [schemaFeatureMigration],
    });
    const eventStore = extensionComponent('eventStore', {
      migrations: () => [databaseFeatureMigration],
    });
    const users = tableComponent({
      tableName: 'users',
      migrations: () => [schemaTableMigration],
    });
    const component = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: { users },
          extensions: { audit },
        }),
      },
      extensions: { eventStore },
    });
    const options = { lock: { options: { timeoutMs: 300 } } };

    await runSQLMigrations(pool, component.migrations(), options);
    await runSQLMigrations(pool, component.migrations(), options);

    const migrationNames = await pool.execute.query<{ name: string }>(
      SQL`SELECT name FROM dmb_migrations WHERE name <> 'table:relational:dmb_migrations:001:create' ORDER BY id`,
    );

    assert.deepStrictEqual(
      migrationNames.rows.map((row) => row.name),
      [
        'schema:relational:public:001:create',
        'schema-table:001',
        'schema-feature:001',
        'database-feature:001',
      ],
    );
    assert.ok(await tableExists(pool.execute, 'component_users'));
    assert.ok(await tableExists(pool.execute, 'schema_audit_log'));
    assert.ok(await tableExists(pool.execute, 'database_outbox'));
  });

  it('runs migrations from indexes declared on tables', async () => {
    const users = tableComponent({
      tableName: 'users',
      migrations: () => [
        sqlMigration('app:public:users:001:create-table', [
          SQL`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL);`,
        ]),
      ],
      indexes: {
        users_email_idx: indexComponent({
          indexName: 'users_email_idx',
          columnNames: ['email'],
          isUnique: true,
          migrations: () => [
            sqlMigration('app:public:users:users_email_idx:002:create-index', [
              SQL`CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);`,
            ]),
          ],
        }),
      },
    });
    const component = databaseComponent({
      databaseName: 'app',
      schemas: {
        public: databaseSchemaComponent({
          schemaName: 'public',
          tables: { users },
        }),
      },
    });
    await runSQLMigrations(pool, component.migrations(), {
      lock: { options: { timeoutMs: 300 } },
    });

    const indexExists = await pool.execute.query<{ exists: boolean }>(
      SQL`
        SELECT EXISTS (
          SELECT FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'users_email_idx'
        )`,
    );
    const migrationNames = await pool.execute.query<{ name: string }>(
      SQL`SELECT name FROM dmb_migrations WHERE name <> 'table:relational:dmb_migrations:001:create' ORDER BY id`,
    );

    assert.strictEqual(indexExists.rows[0]?.exists, true);
    assert.deepStrictEqual(
      migrationNames.rows.map((row) => row.name),
      [
        'schema:relational:public:001:create',
        'app:public:users:001:create-table',
        'index:relational:public:users:users_email_idx:001:create',
        'app:public:users:users_email_idx:002:create-index',
      ],
    );
  });

  it('should timeout if the advisory lock is not acquired within the specified time', async () => {
    const migration: SQLMigration = {
      name: 'timeout_migration',
      sqls: [
        SQL`CREATE TABLE timeout_table (
            id SERIAL PRIMARY KEY,
            data TEXT NOT NULL
        );`,
      ],
    };

    //Simulate holding the advisory lock
    const connection = await pool.connection();
    try {
      await acquireAdvisoryLock(connection.execute, {
        lockId: MIGRATIONS_LOCK_ID,
        mode: 'Permanent',
      });

      try {
        await runSQLMigrations(pool, [migration], {
          lock: { options: { timeoutMs: 300 } },
        });

        assert.fail('The migration should have timed out and not proceeded.');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.strictEqual(
          error.message,
          'Failed to acquire advisory lock within the specified timeout. Migration aborted.',
          'throws a timeout error.',
        );
      }
    } finally {
      await releaseAdvisoryLock(connection.execute, {
        lockId: MIGRATIONS_LOCK_ID,
      });
      await connection.close();
    }
  });

  it('should ensure that advisory locks prevent failing on concurrent migrations', async () => {
    const migration: SQLMigration = {
      name: 'concurrent_migration',
      sqls: [
        SQL`
                CREATE TABLE concurrent_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
      ],
    };

    // Run the first migration but simulate long execution by not releasing the lock immediately
    const connection = await pool.connection();
    try {
      // Simulate other migration holding the advisory lock
      await acquireAdvisoryLock(connection.execute, {
        lockId: MIGRATIONS_LOCK_ID,
      });
      await Promise.all([
        runSQLMigrations(pool, [migration]),
        // simulate other projection running in parallel
        new Promise((resolve) => setTimeout(resolve, 100)).then(() =>
          releaseAdvisoryLock(connection.execute, {
            lockId: MIGRATIONS_LOCK_ID,
          }),
        ),
      ]); // This should wait due to the lock
    } finally {
      await connection.close();
    }
    const wasCreated = await tableExists(pool.execute, 'concurrent_table');

    assert.ok(wasCreated, 'The concurrent_table should exist.');
  });

  it('should correctly apply a migration if the hash matches the previous migration with the same name', async () => {
    const migration: SQLMigration = {
      name: 'hash_check_migration',
      sqls: [
        SQL`
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
      ],
    };

    await runSQLMigrations(pool, [migration]);

    // Attempt to run the same migration again with the same content
    await runSQLMigrations(pool, [migration]); // This should succeed without error

    const migrationCount = await count(
      pool.execute.query<{ count: number }>(
        SQL`SELECT COUNT(*)::int as count FROM dmb_migrations WHERE name = 'hash_check_migration'`,
      ),
    );
    assert.strictEqual(
      migrationCount,
      1,
      'The migration should only be applied once.',
    );
  });

  it('should fail if a migration with the same name has a different hash', async () => {
    const migration: SQLMigration = {
      name: 'hash_check_migration',
      sqls: [
        SQL`
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
      ],
    };

    await runSQLMigrations(pool, [migration]);

    const modifiedMigration: SQLMigration = {
      ...migration,
      sqls: [
        SQL`
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL,
                    extra_column INT
                );`,
      ],
    };

    try {
      await runSQLMigrations(pool, [modifiedMigration]);
      assert.fail('The migration should have failed due to a hash mismatch.');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.strictEqual(
        error.message,
        `Migration hash mismatch for "hash_check_migration". Aborting migration.`,
        'throws a hash mismatch error.',
      );
    }
  });

  it('should silently be not applied but update hash if a migration with the same name has a different hash with ignoreMigrationHashMismatch setting', async () => {
    const migration: SQLMigration = {
      name: 'hash_check_migration',
      sqls: [
        SQL`
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
      ],
    };

    await runSQLMigrations(pool, [migration]);

    const { sql_hash: initialHash } = await single(
      pool.execute.query<{ sql_hash: string }>(
        SQL`
          SELECT sql_hash FROM dmb_migrations WHERE name = 'hash_check_migration'`,
      ),
    );

    const modifiedMigration: SQLMigration = {
      ...migration,
      sqls: [
        SQL`
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL,
                    extra_column INT
                );`,
      ],
    };

    const result = await runSQLMigrations(pool, [modifiedMigration], {
      ignoreMigrationHashMismatch: true,
    });

    assert.ok(
      result.skipped.some((m) => m.name === 'hash_check_migration'),
      'The modified migration should be skipped due to hash mismatch.',
    );

    const { sql_hash: updatedHash } = await single(
      pool.execute.query<{ sql_hash: string }>(
        SQL`SELECT sql_hash FROM dmb_migrations WHERE name = 'hash_check_migration'`,
      ),
    );
    assert.notStrictEqual(
      initialHash,
      updatedHash,
      'The migration hash should be updated in the database.',
    );
  });

  it('handles a large migration with multiple SQL statements', async () => {
    const migration: SQLMigration = {
      name: 'large_migration',
      sqls: [
        SQL`
                CREATE TABLE large_table_1 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
        SQL`
                CREATE TABLE large_table_2 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
        SQL`
                CREATE TABLE large_table_3 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
        SQL`
                CREATE TABLE large_table_4 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
      ],
    };

    await runSQLMigrations(pool, [migration]);

    const table1Exists = await tableExists(pool.execute, 'large_table_1');
    const table2Exists = await tableExists(pool.execute, 'large_table_2');
    const table3Exists = await tableExists(pool.execute, 'large_table_3');
    const table4Exists = await tableExists(pool.execute, 'large_table_4');

    assert.ok(table1Exists, 'The large_table_1 table should exist.');
    assert.ok(table2Exists, 'The large_table_2 table should exist.');
    assert.ok(table3Exists, 'The large_table_3 table should exist.');
    assert.ok(table4Exists, 'The large_table_4 table should exist.');
  });

  describe('running schema component SQL', () => {
    const usersEmail = indexComponent({
      indexName: 'users_email_idx',
      columnNames: ['email'],
      isUnique: true,
    });
    const usersDocument = indexComponent({
      indexName: 'users_document_idx',
      columnNames: ['data'],
      isUnique: false,
      target: jsonDocumentIndexTarget('data'),
    });
    const usersUniqueDocument = indexComponent({
      indexName: 'users_document_uq',
      columnNames: ['data'],
      isUnique: true,
      target: jsonDocumentIndexTarget('data'),
    });

    const usersTable = (
      indexes: Record<string, ReturnType<typeof indexComponent>> = {
        email: usersEmail,
      },
    ) =>
      tableComponent({
        tableName: 'users',
        columns: {
          _id: dumboSchema.column('_id', SQL.column.type.Text, {
            primaryKey: true,
            notNull: true,
          }),
          email: dumboSchema.column('email', SQL.column.type.Text, {
            notNull: true,
          }),
          data: dumboSchema.column('data', SQL.column.type.JSONB()),
        },
        indexes,
      });

    const usersIn = (
      schemaName: string | SQLDefaultSchemaNameToken,
      indexes?: Record<string, ReturnType<typeof indexComponent>>,
    ) =>
      databaseSchemaComponent({
        schemaName,
        tables: { users: usersTable(indexes) },
      });

    const migrate = (
      ...schemas: ReturnType<typeof databaseSchemaComponent>[]
    ) =>
      runSQLMigrations(
        pool,
        databaseComponent({
          databaseName: 'app',
          schemas: Object.fromEntries(
            schemas.map((schema) => [
              databaseSchemaKey(schema.schemaName),
              schema,
            ]),
          ),
        }).migrations(),
      );

    const indexAccessMethod = async (indexName: string): Promise<string> =>
      single(
        pool.execute.query<{ amname: string }>(
          SQL`
            SELECT am.amname
            FROM pg_class c
              JOIN pg_am am ON am.oid = c.relam
            WHERE c.relname = ${indexName}`,
        ),
      ).then((row) => row.amname);

    const tableExistsIn = async (
      databaseSchemaName: string,
      tableName: string,
    ): Promise<boolean> =>
      single(
        pool.execute.query<{ exists: boolean }>(
          SQL`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_schema = ${databaseSchemaName}
                AND table_name = ${tableName}
            )`,
        ),
      ).then((row) => row.exists);

    beforeEach(() =>
      pool.execute.command(SQL`DROP SCHEMA IF EXISTS crm CASCADE`),
    );

    it('creates a table for the default schema in the search path', async () => {
      await migrate(usersIn(SQLDefaultSchemaNameToken.from()));

      assert.ok(await tableExistsIn('public', 'users'));
    });

    it('indexes a JSON document with GIN, and with btree when it is unique', async () => {
      await migrate(
        usersIn(SQLDefaultSchemaNameToken.from(), {
          document: usersDocument,
          uniqueDocument: usersUniqueDocument,
        }),
      );

      assert.strictEqual(await indexAccessMethod('users_document_idx'), 'gin');
      assert.strictEqual(await indexAccessMethod('users_document_uq'), 'btree');
    });

    it('creates a named schema and qualifies its table with it', async () => {
      await migrate(usersIn('crm'));

      assert.ok(await tableExistsIn('crm', 'users'));
      assert.ok(!(await tableExistsIn('public', 'users')));
    });

    it('keeps the default schema and a named one on separate tables', async () => {
      await migrate(usersIn(SQLDefaultSchemaNameToken.from()), usersIn('crm'));
      await pool.execute.command(
        SQL`INSERT INTO users (_id, email) VALUES ('1', 'default@test')`,
      );

      assert.strictEqual(
        await count(
          pool.execute.query<{ count: number }>(
            SQL`SELECT COUNT(*)::int as count FROM public.users`,
          ),
        ),
        1,
      );
      assert.strictEqual(
        await count(
          pool.execute.query<{ count: number }>(
            SQL`SELECT COUNT(*)::int as count FROM crm.users`,
          ),
        ),
        0,
      );
    });
  });
});
