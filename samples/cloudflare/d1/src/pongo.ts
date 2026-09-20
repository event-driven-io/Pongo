import { pongoClient } from '@event-driven-io/pongo';
import { d1Driver } from '@event-driven-io/pongo/cloudflare';
import { env } from 'cloudflare:workers';
import pongoConfig from './pongo.config';

export const pongoDb = pongoClient({
  driver: d1Driver,
  database: env.DB,
  schema: {
    definition: pongoConfig.schema,
    autoMigration:
      env.ENVIRONMENT === 'development' ? 'CreateOrUpdate' : 'None',
  },
  errors: { throwOnOperationFailures: true },
}).database;
