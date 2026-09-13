import { SQL } from '@event-driven-io/dumbo';
import { pongoSchema } from '@event-driven-io/pongo';
import type { ShoppingCart } from './shoppingCarts/shoppingCart';

const shoppingCarts = pongoSchema.collection<ShoppingCart>('shoppingCarts', {
  indexes: {
    currentByClient: pongoSchema.index.custom(
      'shopping_carts_one_open_per_client',
      ({ tableReference, indexReference }) => SQL`
        CREATE UNIQUE INDEX IF NOT EXISTS ${indexReference}
        ON ${tableReference} (json_extract(data, '$.clientId'))
        WHERE json_extract(data, '$.status') = 'Opened'
      `,
    ),
  },
});

export default {
  schema: pongoSchema.client({
    database: pongoSchema.db({ collections: { shoppingCarts } }),
  }),
};
