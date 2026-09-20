import { getApplication } from '@event-driven-io/emmett-honojs';
import { env } from 'cloudflare:workers';
import {
  getUnitPrice,
  shoppingCartApi,
  ShoppingCartDurableObject,
} from './shoppingCarts';

export { ShoppingCartDurableObject };

export default getApplication({
  apis: [
    shoppingCartApi({
      shoppingCarts: env.SHOPPING_CARTS,
      getUnitPrice,
      getCurrentTime: () => new Date(),
    }),
  ],
});
