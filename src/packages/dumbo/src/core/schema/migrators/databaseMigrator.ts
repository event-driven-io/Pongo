import { type Dumbo, JSONSerializer } from '../..';
import type { DatabaseTransactionOptions } from '../../connections';
import { fromDatabaseDriverType } from '../../drivers';
import { singleOrNull } from '../../query';
import { DefaultDatabaseSchemaName, getFormatter, SQL } from '../../sql';
import type { AnySchemaComponent } from '../schemaComponent';
import type { MigrationStyle, SQLMigration } from '../sqlMigration';
import { migrationTableComponentFor } from './migrationTableComponent';
import {
  getDefaultMigratorOptionsFromRegistry,
  getMigrationHash,
  type MigratorOptions,
  rendersNothing,
  runSQLMigrations,
  type RunSQLMigrationsResult,
} from './migrator';

export type MigratorRunOptions = Omit<MigratorOptions, 'migrationTable'>;
export type DatabaseMigratorOptions = MigratorOptions & {
  component: AnySchemaComponent;
  pool: Dumbo;
  autoMigration?: MigrationStyle | undefined;
  transactionOptions?: DatabaseTransactionOptions | undefined;
};
export type DatabaseMigrator = Readonly<{
  component: AnySchemaComponent;
  sql(): string;
  print(): void;
  migrate(options?: MigratorRunOptions): Promise<RunSQLMigrationsResult>;
  ensureMigrated(): Promise<void>;
}>;

export class PendingMigrationsError extends Error {
  readonly pendingMigrations: ReadonlyArray<SQLMigration>;
  constructor(pendingMigrations: ReadonlyArray<SQLMigration>) {
    super(
      `Pending migrations: ${pendingMigrations.map(({ name }) => name).join(', ')}`,
    );
    this.name = 'PendingMigrationsError';
    this.pendingMigrations = Object.freeze([...pendingMigrations]);
  }
}

export const databaseMigrator = (
  options: DatabaseMigratorOptions,
): DatabaseMigrator => {
  const {
    component,
    pool,
    autoMigration = 'CreateOrUpdate',
    transactionOptions,
    ...providedDefaults
  } = options;
  const databaseType = fromDatabaseDriverType(pool.driverType).databaseType;
  const registeredDefaults =
    getDefaultMigratorOptionsFromRegistry(databaseType);
  const defaults = {
    ...registeredDefaults,
    ...providedDefaults,
    execute: providedDefaults.execute ?? registeredDefaults.execute,
    lock: {
      ...registeredDefaults.lock,
      ...providedDefaults.lock,
      options: {
        ...registeredDefaults.lock?.options,
        ...providedDefaults.lock?.options,
      },
    },
    migrationTable:
      providedDefaults.migrationTable ?? registeredDefaults.migrationTable,
    dryRun: providedDefaults.dryRun ?? registeredDefaults.dryRun,
    ignoreMigrationHashMismatch:
      providedDefaults.ignoreMigrationHashMismatch ??
      registeredDefaults.ignoreMigrationHashMismatch,
    migrationTimeoutMS:
      providedDefaults.migrationTimeoutMS ??
      registeredDefaults.migrationTimeoutMS,
  };
  const migrationTable = { ...defaults.migrationTable };
  const boundTransactionOptions = transactionOptions
    ? { ...transactionOptions }
    : undefined;
  const migrations = [...component.migrations()];
  const formatter = getFormatter(databaseType);
  let assured = false;
  let inFlight: Promise<void> | undefined;
  let migrationInFlight: Promise<RunSQLMigrationsResult> | undefined;

  const sql = (): string =>
    formatter.describe(
      migrations.flatMap(({ sqls }) => sqls),
      { serializer: JSONSerializer },
    );
  const migrate = (
    runOptions?: MigratorRunOptions,
  ): Promise<RunSQLMigrationsResult> => {
    const resolved = {
      ...defaults,
      ...runOptions,
      migrationTable,
      execute: runOptions?.execute ?? defaults.execute,
      lock: {
        ...defaults.lock,
        ...runOptions?.lock,
        options: {
          ...defaults.lock.options,
          ...runOptions?.lock?.options,
        },
      },
      dryRun: runOptions?.dryRun ?? defaults.dryRun,
      ignoreMigrationHashMismatch:
        runOptions?.ignoreMigrationHashMismatch ??
        defaults.ignoreMigrationHashMismatch,
      migrationTimeoutMS:
        runOptions?.migrationTimeoutMS ?? defaults.migrationTimeoutMS,
    };
    const run = (): Promise<RunSQLMigrationsResult> =>
      resolved.execute && !resolved.dryRun
        ? runSQLMigrations(pool, migrations, resolved)
        : pool.withTransaction(
            async ({ execute }) => ({
              success: !resolved.dryRun,
              result: await runSQLMigrations(pool, migrations, {
                ...resolved,
                execute,
              }),
            }),
            boundTransactionOptions,
          );

    if (resolved.dryRun) return run();

    const pending = run()
      .then((result) => {
        assured = true;
        return result;
      })
      .finally(() => {
        if (migrationInFlight === pending) migrationInFlight = undefined;
      });
    migrationInFlight = pending;
    return pending;
  };

  const checkHistory = async (): Promise<void> => {
    const execute = defaults.execute ?? pool.execute;
    const reference = migrationTableComponentFor(migrationTable).fullName;
    const tableName = reference.tableName;
    const schemaName = reference.databaseSchemaName;
    const physicalName =
      schemaName === DefaultDatabaseSchemaName
        ? tableName
        : `${schemaName}.${tableName}`;
    const postgresRelation =
      schemaName === DefaultDatabaseSchemaName
        ? `"${tableName.replaceAll('"', '""')}"`
        : `"${schemaName.replaceAll('"', '""')}"."${tableName.replaceAll('"', '""')}"`;
    const existsSQL =
      databaseType === 'PostgreSQL'
        ? SQL`SELECT to_regclass(${postgresRelation}) IS NOT NULL AS "exists"`
        : SQL`SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${physicalName}) AS "exists"`;
    const timeout = { timeoutMS: defaults.migrationTimeoutMS };
    const tableExists = await singleOrNull(
      execute.query<{ exists: boolean | number }>(existsSQL, timeout),
    );
    const history = new Map<string, string>();
    if (tableExists?.exists) {
      const result = await execute.query<{ name: string; sqlHash: string }>(
        SQL`SELECT name, sql_hash AS "sqlHash" FROM ${reference}`,
        timeout,
      );
      for (const row of result.rows) history.set(row.name, row.sqlHash);
    }
    const pending: SQLMigration[] = [];
    for (const migration of migrations) {
      const sqls = migration.sqls.filter(
        (statement) => !rendersNothing(statement, formatter),
      );
      if (sqls.length === 0) continue;
      const recorded = history.get(migration.name);
      if (
        recorded === undefined ||
        (!defaults.ignoreMigrationHashMismatch &&
          !migration.ignoreHashMismatch &&
          recorded !== (await getMigrationHash(sqls, formatter)))
      )
        pending.push(migration);
    }
    if (pending.length) throw new PendingMigrationsError(pending);
  };

  const ensureMigrated = (): Promise<void> => {
    if (assured) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = (
      migrationInFlight
        ? migrationInFlight.then(() => {})
        : autoMigration === 'None'
          ? checkHistory()
          : migrate().then(() => {})
    )
      .then(() => {
        if (!defaults.dryRun || autoMigration === 'None') assured = true;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
  return Object.freeze({
    component,
    sql,
    print: () => {
      console.log(sql());
    },
    migrate,
    ensureMigrated,
  });
};
