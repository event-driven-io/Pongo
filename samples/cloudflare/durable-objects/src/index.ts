import { getApplication } from '@event-driven-io/emmett-honojs';
import { Hono } from 'hono';
import { shoppingCartApi, ShoppingCartDurableObject } from './shoppingCarts';

export { ShoppingCartDurableObject };

const unitPrices: Readonly<Record<string, number>> = {
  'product-1': 1000,
  'product-2': 2500,
};

const getUnitPrice = (productId: string): Promise<number> => {
  const unitPrice = unitPrices[productId];
  if (unitPrice === undefined) throw new Error('Product not found');
  return Promise.resolve(unitPrice);
};

const api = new Hono<{ Bindings: CloudflareBindings }>();
shoppingCartApi(getUnitPrice, () => new Date())(api);

const app = getApplication({ apis: [] });
app.route('/', api);

export default app;
