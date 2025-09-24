import { pongoDatabaseDriverRegistry } from '../../core';

pongoDatabaseDriverRegistry.register('PostgreSQL:pg', () =>
  import('../postgresql/pg').then((m) => m.pgDriver),
);
