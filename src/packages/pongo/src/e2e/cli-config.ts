import { pongoSchema } from '../core';

type User = { name: string };

export default {
  schema: pongoSchema.client({
    database: pongoSchema.db({
      users: pongoSchema.collection<User>('users'),
    }),
  }),
};
