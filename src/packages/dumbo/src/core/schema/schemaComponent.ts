import type { SQLMigration } from './sqlMigration';

export type SchemaComponent<
  ComponentKey extends string = string,
  AdditionalData extends
    | Exclude<
        Record<string, unknown>,
        | 'schemaComponentKey'
        | 'components'
        | 'migrations'
        | 'addComponent'
        | 'addMigration'
      >
    | undefined = undefined,
> = {
  schemaComponentKey: ComponentKey;
  components: ReadonlyMap<string, SchemaComponent>;
  migrations: ReadonlyArray<SQLMigration>;

  addComponent: <
    SchemaComponentType extends SchemaComponent<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Record<string, any>
    > = SchemaComponent<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Record<string, any>
    >,
  >(
    component: SchemaComponentType,
  ) => SchemaComponentType;
  addMigration: (migration: SQLMigration) => void;
} & Exclude<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  AdditionalData extends undefined ? {} : AdditionalData,
  | 'schemaComponentKey'
  | 'components'
  | 'migrations'
  | 'addComponent'
  | 'addMigration'
>;

export type ExtractAdditionalData<T> =
  T extends SchemaComponent<infer _ComponentType, infer Data> ? Data : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySchemaComponent = SchemaComponent<string, Record<string, any>>;

export type AnySchemaComponentOfType<ComponentType extends string = string> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SchemaComponent<ComponentType, any>;

export type SchemaComponentOptions<
  AdditionalOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  migrations?: ReadonlyArray<SQLMigration>;
  components?: ReadonlyArray<SchemaComponent>;
} & Omit<AdditionalOptions, 'migrations' | 'components'>;

export type SchemaComponentType<Kind extends string = string> = `sc:${Kind}`;

export type DumboSchemaComponentType<Kind extends string = string> =
  SchemaComponentType<`dumbo:${Kind}`>;

export const schemaComponent = <const ComponentKey extends string = string>(
  key: ComponentKey,
  options: SchemaComponentOptions,
): SchemaComponent<ComponentKey> => {
  const componentsMap = new Map<string, AnySchemaComponent>(
    options.components?.map((comp) => [comp.schemaComponentKey, comp]),
  );

  const migrations: SQLMigration[] = [...(options.migrations ?? [])];

  return {
    schemaComponentKey: key,
    components: componentsMap,
    get migrations(): SQLMigration[] {
      return [
        ...migrations,
        ...Array.from(componentsMap.values()).flatMap((c) => c.migrations),
      ];
    },
    addComponent: <
      SchemaComponentType extends AnySchemaComponent = AnySchemaComponent,
    >(
      component: SchemaComponentType,
    ): SchemaComponentType => {
      componentsMap.set(component.schemaComponentKey, component);
      migrations.push(...component.migrations);
      return component;
    },
    addMigration: (migration: SQLMigration) => {
      migrations.push(migration);
    },
  };
};

export const isSchemaComponentOfType = <
  SchemaComponentOfType extends AnySchemaComponent = AnySchemaComponent,
>(
  component: AnySchemaComponent,
  prefix: string,
): component is SchemaComponentOfType =>
  component.schemaComponentKey.startsWith(prefix);

export const filterSchemaComponentsOfType = <T extends AnySchemaComponent>(
  components: ReadonlyMap<string, AnySchemaComponent>,
  prefix: string,
): ReadonlyMap<string, T> => mapSchemaComponentsOfType<T>(components, prefix);

export const mapSchemaComponentsOfType = <T extends AnySchemaComponent>(
  components: ReadonlyMap<string, AnySchemaComponent>,
  prefix: string,
  keyMapper?: (component: T) => string,
): ReadonlyMap<string, T> =>
  new Map(
    Array.from(components.entries())
      .filter(([urn]) => urn.startsWith(prefix))
      .map(([urn, component]) => [
        keyMapper ? keyMapper(component as T) : urn,
        component as T,
      ]),
  );

export const findSchemaComponentsOfType = <T extends AnySchemaComponent>(
  root: AnySchemaComponent,
  prefix: string,
): T[] => {
  const results: T[] = [];

  const traverse = (component: AnySchemaComponent) => {
    if (component.schemaComponentKey.startsWith(prefix)) {
      results.push(component as T);
    }
    for (const child of component.components.values()) {
      traverse(child);
    }
  };

  traverse(root);

  return results;
};
