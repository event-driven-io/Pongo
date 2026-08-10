import {
  createSchemaComponent,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
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
): ExtensionComponent<Name> =>
  createSchemaComponent(
    extensionComponentType,
    {
      components: Object.values(components),
      migrations: options.migrations,
    },
    { extensionName },
  );

export const isExtensionComponent = (
  component: AnySchemaComponent,
): component is ExtensionComponent =>
  component[schemaComponentType] === extensionComponentType;
