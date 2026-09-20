import { NoContent, type WebApiSetup } from '@event-driven-io/emmett-honojs';
import type { PongoDb } from '@event-driven-io/pongo';

type MigrationsApiDependencies = {
  pongoDb: PongoDb;
  migrationToken?: string;
};

export const migrationsApi =
  ({ pongoDb, migrationToken }: MigrationsApiDependencies): WebApiSetup =>
  (router) => {
    router.post('/_system/migrations', async (context) => {
      if (
        !migrationToken ||
        context.req.header('Authorization') !== `Bearer ${migrationToken}`
      )
        return context.body(null, 401);

      await pongoDb.schema.migrate();

      return NoContent({ context });
    });
  };
