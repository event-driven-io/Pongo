import type { AnyDatabaseSchemaComponent } from './components/databaseSchemaComponent';
import {
  schemaComponent,
  schemaComponentMap,
  type SchemaComponent,
  type SchemaComponentContext,
} from './schemaComponent';
import type { SQLMigration } from './sqlMigration';

export const extensionComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.extension',
);

export type ExtensionSchemas = Readonly<
  Record<string, AnyDatabaseSchemaComponent>
>;

export interface AnyExtensionComponent extends SchemaComponent<
  typeof extensionComponentType
> {
  readonly extensionName: string;
  readonly schemas: ExtensionSchemas;
  readonly extensions: Readonly<Record<string, AnyExtensionComponent>>;
}

export type ExtensionComponents = Readonly<
  Record<string, AnyExtensionComponent>
>;

export type SchemasFromExtensions<Extensions extends ExtensionComponents> = [
  keyof Extensions,
] extends [never]
  ? Readonly<Record<never, never>>
  : string extends keyof Extensions
    ? Readonly<Record<never, never>>
    : (
          Extensions[keyof Extensions] extends infer Extension
            ? Extension extends {
                schemas: infer Schemas extends ExtensionSchemas;
              }
              ? (schemas: Schemas) => void
              : never
            : never
        ) extends (schemas: infer Schemas extends ExtensionSchemas) => void
      ? Schemas
      : Readonly<Record<never, never>>;

export type ExtensionComponent<
  Name extends string = string,
  Schemas extends ExtensionSchemas = ExtensionSchemas,
  Extensions extends ExtensionComponents = ExtensionComponents,
> = SchemaComponent<typeof extensionComponentType> &
  Readonly<{
    extensionName: Name;
    schemas: Schemas & SchemasFromExtensions<Extensions>;
    extensions: Extensions;
  }>;

export type ExtensionComponentOptions<
  Schemas extends ExtensionSchemas,
  Extensions extends ExtensionComponents,
> = Readonly<{
  schemas?: Schemas | undefined;
  extensions?: Extensions | undefined;
  migrations?:
    | ((context: SchemaComponentContext) => ReadonlyArray<SQLMigration>)
    | undefined;
}>;

export const extensionComponent = <
  const Name extends string,
  const Schemas extends ExtensionSchemas = Readonly<Record<never, never>>,
  const Extensions extends ExtensionComponents = Readonly<Record<never, never>>,
>(
  extensionName: Name,
  options: ExtensionComponentOptions<Schemas, Extensions> = {},
): ExtensionComponent<Name, Schemas, Extensions> => {
  const directSchemas = (options.schemas ?? {}) as Schemas;
  const extensions = (options.extensions ?? {}) as Extensions;
  const schemaEntries: [string, AnyDatabaseSchemaComponent][] = [];
  const schemaOwners = new Map<string, string | undefined>();

  for (const [schemaKey, schema] of Object.entries(directSchemas)) {
    if (
      typeof schema.schemaName === 'string' &&
      schema.schemaName !== schemaKey
    ) {
      throw new Error(
        `Database schema record key "${schemaKey}" conflicts with its explicit name "${schema.schemaName}"`,
      );
    }
    schemaEntries.push([schemaKey, schema]);
    schemaOwners.set(schemaKey, undefined);
  }

  for (const extension of Object.values(extensions)) {
    for (const [schemaKey, schema] of Object.entries(extension.schemas)) {
      if (schemaOwners.has(schemaKey)) {
        const owner = schemaOwners.get(schemaKey);
        throw new Error(
          owner === undefined
            ? `Extension "${extensionName}" declares database schema key "${schemaKey}" directly and through nested extension "${extension.extensionName}"`
            : `Extension "${extensionName}" receives database schema key "${schemaKey}" from nested extensions "${owner}" and "${extension.extensionName}"`,
        );
      }
      schemaEntries.push([schemaKey, schema]);
      schemaOwners.set(schemaKey, extension.extensionName);
    }
  }

  const children = Object.freeze([
    ...Object.values(directSchemas),
    ...Object.values(extensions),
  ]);
  const exposedSchemas = schemaComponentMap(
    Object.fromEntries(schemaEntries),
  ) as Schemas & SchemasFromExtensions<Extensions>;

  const component: ExtensionComponent<Name, Schemas, Extensions> = {
    ...schemaComponent(extensionComponentType, {
      components: children,
      migrations: options.migrations,
    }),
    extensionName,
    schemas: exposedSchemas,
    extensions: schemaComponentMap(extensions),
  };

  return component;
};
