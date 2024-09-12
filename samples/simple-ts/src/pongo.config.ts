import { pongoSchema } from '@event-driven-io/pongo';

export type User = { _id?: string; name: string; age: number };

export default {
  schema: pongoSchema.client({
    database: pongoSchema.db({
      users: pongoSchema.collection<User>('users'),
    }),
  }),
};
