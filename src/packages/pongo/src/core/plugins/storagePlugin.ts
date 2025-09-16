import type {
  Connection,
  ConnectorType,
  StoragePlugin,
} from '@event-driven-io/dumbo';

export interface PongoStoragePlugin<
  Connector extends ConnectorType = ConnectorType,
  ConnectionType extends Connection<Connector> = Connection<Connector>,
> {
  readonly connector: Connector;

  readonly dumboPlugin: StoragePlugin<Connector, ConnectionType>;
}

export const PongoStoragePluginRegistry = () => {
  const plugins = new Map<
    ConnectorType,
    PongoStoragePlugin | (() => Promise<PongoStoragePlugin>)
  >();

  const register = <
    Connector extends ConnectorType = ConnectorType,
    ConnectionType extends Connection<Connector> = Connection<Connector>,
  >(
    connector: Connector,
    plugin:
      | PongoStoragePlugin<Connector, ConnectionType>
      | (() => Promise<PongoStoragePlugin<Connector, ConnectionType>>),
  ): void => {
    const entry = plugins.get(connector);
    if (
      entry &&
      (typeof entry !== 'function' || typeof plugin !== 'function')
    ) {
      return;
    }
    plugins.set(connector, plugin);
  };

  const tryResolve = async <
    Connector extends ConnectorType = ConnectorType,
    ConnectionType extends Connection<Connector> = Connection<Connector>,
  >(
    connector: ConnectorType,
  ): Promise<PongoStoragePlugin<Connector, ConnectionType> | null> => {
    const entry = plugins.get(connector);

    if (!entry) return null;

    if (typeof entry !== 'function')
      return entry as unknown as PongoStoragePlugin<Connector, ConnectionType>;

    const plugin = await entry();

    register(connector, plugin);
    return plugin as unknown as PongoStoragePlugin<Connector, ConnectionType>;
  };

  const tryGet = <
    Connector extends ConnectorType = ConnectorType,
    ConnectionType extends Connection<Connector> = Connection<Connector>,
  >(
    connector: ConnectorType,
  ): PongoStoragePlugin<Connector, ConnectionType> | null => {
    const entry = plugins.get(connector);
    return typeof entry !== 'function'
      ? (entry as unknown as PongoStoragePlugin<Connector, ConnectionType>)
      : null;
  };

  const has = (connector: ConnectorType): boolean => plugins.has(connector);

  return {
    register,
    tryResolve,
    tryGet,
    has,
    get connectorTypes(): ConnectorType[] {
      return Array.from(plugins.keys());
    },
  };
};

export const pongoStoragePluginRegistry = PongoStoragePluginRegistry();
