export type Transaction<
  ConnectorType extends string = string,
  DbClient = unknown,
> = {
  type: ConnectorType;
  client: Promise<DbClient>;
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
};

export type Connection<
  ConnectorType extends string = string,
  DbClient = unknown,
> = {
  type: ConnectorType;
  open: () => Promise<DbClient>;
  close: () => Promise<void>;

  beginTransaction: () => Promise<Transaction<ConnectorType, DbClient>>;
};
