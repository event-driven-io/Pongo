import { getApplication } from '@event-driven-io/emmett-honojs';
import { pongoClient, type PongoDb } from '@event-driven-io/pongo';
import { d1Driver } from '@event-driven-io/pongo/cloudflare';
import { Hono } from 'hono';
import { migrationsApi } from './migrations';
import pongoConfig from './pongo.config';
import { shoppingCartApi } from './shoppingCarts';

type Bindings = Omit<CloudflareBindings, 'ENVIRONMENT'> & {
  ENVIRONMENT: 'development' | 'production' | 'test';
  MIGRATION_TOKEN?: string;
};

let pongoDb: PongoDb | undefined;

const getPongoDb = (env: Bindings): PongoDb => {
  pongoDb ??= pongoClient({
    driver: d1Driver,
    database: env.DB,
    schema: {
      definition: pongoConfig.schema,
      autoMigration:
        env.ENVIRONMENT === 'development' ? 'CreateOrUpdate' : 'None',
    },
  }).database;
  return pongoDb;
};

const unitPrices: Readonly<Record<string, number>> = {
  'product-1': 1000,
  'product-2': 2500,
};

const getUnitPrice = (productId: string): Promise<number> => {
  const unitPrice = unitPrices[productId];
  if (unitPrice === undefined) throw new Error('Product not found');
  return Promise.resolve(unitPrice);
};

const api = new Hono<{ Bindings: Bindings }>();
migrationsApi(getPongoDb)(api);
shoppingCartApi(getPongoDb, getUnitPrice, () => new Date())(api);

const app = getApplication({ apis: [] });
app.route('/', api);

export default app;
