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

export type ExtensionComponent<
  Name extends string = string,
  Components extends ExtensionComponents = ExtensionComponents,
> = SchemaComponent<typeof extensionComponentType> &
  Readonly<{
    extensionName: Name;
    components: Components;
  }>;

export const extensionComponent = <
  const Name extends string,
  const Components extends ExtensionComponents,
>(
  extensionName: Name,
  components: Components,
  options: Omit<SchemaComponentOptions, 'components'> = {},
): ExtensionComponent<Name, Components> => {
  const base = createSchemaComponent(
    extensionComponentType,
    {
      components,
      migrations: options.migrations,
    },
    { extensionName },
  );

  return base;
};

export const isExtensionComponent = (
  component: AnySchemaComponent,
): component is ExtensionComponent =>
  component[schemaComponentType] === extensionComponentType;
