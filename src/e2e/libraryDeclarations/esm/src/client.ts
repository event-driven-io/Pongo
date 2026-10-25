import { SQL } from '@event-driven-io/dumbo';
import { pongoClient, pongoSchema } from '@event-driven-io/pongo';
import { pongoDriver } from '@event-driven-io/pongo/pg';

export type User = { _id?: string; name: string; points: number };

export const schema = pongoSchema.client({
  app: pongoSchema.db('app', {
    collections: {
      users: pongoSchema.collection<User>('users'),
    },
  }),
});

export const client = pongoClient({
  driver: pongoDriver,
  connectionString: 'postgresql://localhost:5432/postgres',
  schema: { definition: schema, autoMigration: 'None' },
});

export const users = client.app.users;

export const findUser = (id: string) => users.findOne({ _id: id });

export const findUsersWithSQL = () =>
  users.find(SQL`SELECT * FROM users WHERE data->>'name' = ${'Alice'}`);

export const addPoints = (id: string, points: number) =>
  users.updateOne({ _id: id }, { $inc: { points } });

export const findUserInTransaction = (id: string) =>
  client.withSession((session) =>
    session.withTransaction(() => users.findOne({ _id: id }, { session })),
  );
