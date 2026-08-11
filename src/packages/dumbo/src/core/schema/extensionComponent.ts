import {
  dedupeMigrations,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentContext,
  type SchemaComponentMap,
  type SchemaComponentOptions,
} from './schemaComponent';

export const extensionComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.extension',
);

export type ExtensionComponents = SchemaComponentMap;

export type ExtensionComponent<Name extends string = string> = SchemaComponent<
  typeof extensionComponentType
> &
  Readonly<{
    extensionName: Name;
  }>;

export const extensionComponent = <const Name extends string>(
  extensionName: Name,
  components: ExtensionComponents,
  options: Omit<SchemaComponentOptions, 'components'> = {},
): ExtensionComponent<Name> => {
  const children = Object.freeze(Object.values(components));

  const component: ExtensionComponent<Name> = {
    [schemaComponentType]: extensionComponentType,
    extensionName,
    components: children,
    migrations: (context: SchemaComponentContext = {}) =>
      dedupeMigrations([
        ...(options.migrations?.(context) ?? []),
        ...children.flatMap((child) => child.migrations(context)),
      ]),
  };

  return component;
};

export const isExtensionComponent = (
  component: AnySchemaComponent,
): component is ExtensionComponent =>
  component[schemaComponentType] === extensionComponentType;
