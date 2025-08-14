import { tracer, type Dumbo, type DumboConnectionOptions } from '..';
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

export const PluginRegistry = () => {
  const plugins = new Map<
    ConnectorType,
    StoragePlugin | (() => Promise<StoragePlugin>)
  >();

  return {
    register: <
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
        tracer.warn(`Plugin already registered for connector: ${connector}`);
        return;
      }
      plugins.set(connector, plugin);
    },

    tryResolve: async <
      Connector extends ConnectorType = ConnectorType,
      ConnectionType extends Connection<Connector> = Connection<Connector>,
    >(
      connector: ConnectorType,
    ): Promise<StoragePlugin<Connector, ConnectionType> | null> => {
      const entry = plugins.get(connector);
      if (!entry) {
        return null;
      }

      if (typeof entry === 'function') {
        const plugin = await entry();
        plugins.set(connector, plugin);
        return plugin as unknown as StoragePlugin<Connector, ConnectionType>;
      }

      return entry as unknown as StoragePlugin<Connector, ConnectionType>;
    },

    tryGet: <
      Connector extends ConnectorType = ConnectorType,
      ConnectionType extends Connection<Connector> = Connection<Connector>,
    >(
      connector: ConnectorType,
    ): StoragePlugin<Connector, ConnectionType> | null => {
      const entry = plugins.get(connector);
      return typeof entry !== 'function'
        ? (entry as unknown as StoragePlugin<Connector, ConnectionType>)
        : null;
    },

    get connectorTypes(): ConnectorType[] {
      return Array.from(plugins.keys());
    },

    has: (connector: ConnectorType): boolean => plugins.has(connector),
  };
};

export const pluginRegistry = PluginRegistry();
