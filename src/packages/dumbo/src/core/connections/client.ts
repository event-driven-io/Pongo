export type DbClientSetup<DbClient = unknown> = {
  connect: () => Promise<DbClient> | void;
  close: (client: DbClient) => Promise<void> | void;
};
