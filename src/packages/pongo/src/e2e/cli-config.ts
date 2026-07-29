import { pongoSchema, type PongoSchemaConfig } from '../core';

type User = { name: string };

const config: PongoSchemaConfig = {
  schema: pongoSchema.client({
    database: pongoSchema.db({
      collections: {
        users: pongoSchema.collection<User>('users'),
      },
    }),
  }),
};

export default config;
