import type { Filter, MongoClient, WithId } from '@event-driven-io/pongo/shim';

export type ShimUser = { _id: string; name: string; points: number };

export const shimUsers = (client: MongoClient) =>
  client.db('app').collection<ShimUser>('users');

export const findShimUser = (
  client: MongoClient,
  filter: Filter<ShimUser>,
): Promise<WithId<ShimUser> | null> => shimUsers(client).findOne(filter);
