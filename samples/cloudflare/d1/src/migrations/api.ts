import type { PongoDb } from '@event-driven-io/pongo';
import type { Hono } from 'hono';

type MigrationBindings = {
  MIGRATION_TOKEN?: string;
};

export const migrationsApi =
  <Bindings extends MigrationBindings>(
    getPongoDb: (bindings: Bindings) => PongoDb,
  ) =>
  (router: Hono<{ Bindings: Bindings }>) => {
    router.post('/_system/migrations', async (context) => {
      const migrationToken = context.env.MIGRATION_TOKEN;
      if (
        !migrationToken ||
        context.req.header('Authorization') !== `Bearer ${migrationToken}`
      )
        return context.body(null, 401);

      try {
        await getPongoDb(context.env).schema.migrate();
        return context.body(null, 204);
      } catch {
        return context.body(null, 500);
      }
    });
  };
