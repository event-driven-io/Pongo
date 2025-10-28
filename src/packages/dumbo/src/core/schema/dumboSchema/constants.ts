export const DEFAULT_SCHEMA = Symbol.for('dumbo.defaultSchema');

export const DATABASE_DEFAULTS = {
  PostgreSQL: { defaultDatabase: 'postgres', defaultSchema: 'public' },
  MySQL: { defaultDatabase: null, defaultSchema: null },
  SQLite: { defaultDatabase: null, defaultSchema: 'main' },
  SqlServer: { defaultDatabase: 'master', defaultSchema: 'dbo' },
} as const;
