import { pongoDatabaseDriverRegistry } from '../../core';

export * from './collection';

pongoDatabaseDriverRegistry.register('PostgreSQL:pg', () =>
  import('../postgresql/pg').then((m) => m.pgDriver),
);
