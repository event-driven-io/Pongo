import { getApplication } from '@event-driven-io/emmett-honojs';
import { env } from 'cloudflare:workers';
import { migrationsApi } from './migrations';
import { pongoDb } from './pongo';
import { getUnitPrice, shoppingCartApi } from './shoppingCarts';

export default getApplication({
  apis: [
    migrationsApi({ pongoDb, migrationToken: env.MIGRATION_TOKEN }),
    shoppingCartApi({
      pongoDb,
      getUnitPrice,
      getCurrentTime: () => new Date(),
    }),
  ],
});
