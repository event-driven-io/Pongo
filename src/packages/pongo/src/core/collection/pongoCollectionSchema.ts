import { type ConnectorType } from '@event-driven-io/dumbo';

export type PongoSchemaComponentOptions<
  Connector extends ConnectorType = ConnectorType,
> = Readonly<{
  collectionName: string;
  connector: Connector;
}>;
