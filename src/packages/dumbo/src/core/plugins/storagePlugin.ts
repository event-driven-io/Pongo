import { type Dumbo, type DumboConnectionOptions } from '..';
import type { Connection } from '../connections';
import type { ConnectorType } from '../connectors';
import type { MigratorOptions } from '../schema';
import type { SQLFormatter } from '../sql';

export interface StoragePlugin<
  Connector extends ConnectorType = ConnectorType,
  ConnectionType extends Connection<Connector> = Connection<Connector>,
> {
  readonly connector: Connector;

  createPool(options: DumboConnectionOptions): Dumbo<Connector, ConnectionType>;

  readonly sqlFormatter: SQLFormatter;

  readonly defaultMigratorOptions: MigratorOptions;
}

export const StoragePluginRegistry = () => {
  const plugins = new Map<
    ConnectorType,
    StoragePlugin | (() => Promise<StoragePlugin>)
  >();

  const register = <
    Connector extends ConnectorType = ConnectorType,
    ConnectionType extends Connection<Connector> = Connection<Connector>,
  >(
    connector: Connector,
    plugin:
      | StoragePlugin<Connector, ConnectionType>
      | (() => Promise<StoragePlugin<Connector, ConnectionType>>),
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
  ): Promise<StoragePlugin<Connector, ConnectionType> | null> => {
    const entry = plugins.get(connector);

    if (!entry) return null;

    if (typeof entry !== 'function')
      return entry as unknown as StoragePlugin<Connector, ConnectionType>;

    const plugin = await entry();

    register(connector, plugin);
    return plugin as unknown as StoragePlugin<Connector, ConnectionType>;
  };

  const tryGet = <
    Connector extends ConnectorType = ConnectorType,
    ConnectionType extends Connection<Connector> = Connection<Connector>,
  >(
    connector: ConnectorType,
  ): StoragePlugin<Connector, ConnectionType> | null => {
    const entry = plugins.get(connector);
    return typeof entry !== 'function'
      ? (entry as unknown as StoragePlugin<Connector, ConnectionType>)
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

declare global {
  // eslint-disable-next-line no-var
  var storagePluginRegistry: ReturnType<typeof StoragePluginRegistry>;
}

export const storagePluginRegistry = (globalThis.storagePluginRegistry =
  globalThis.storagePluginRegistry ?? StoragePluginRegistry());
