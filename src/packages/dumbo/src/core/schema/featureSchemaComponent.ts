import {
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from './schemaComponent';

export type FeatureSchemaComponentVisibility = 'opaque' | 'expanded';
export type FeatureSchemaComponentScope = 'database' | 'database_schema';

export type FeatureSchemaComponentURNType = 'sc:dumbo:feature';
export type FeatureSchemaComponentURN<
  FeatureKind extends string = string,
  FeatureName extends string = string,
> = `${FeatureSchemaComponentURNType}:${FeatureKind}:${FeatureName}`;

export const FeatureSchemaComponentURNType: FeatureSchemaComponentURNType =
  'sc:dumbo:feature';

export const FeatureSchemaComponentURN = <
  const FeatureKind extends string = string,
  const FeatureName extends string = string,
>({
  featureKind,
  featureName,
}: {
  featureKind: FeatureKind;
  featureName: FeatureName;
}): FeatureSchemaComponentURN<FeatureKind, FeatureName> =>
  `${FeatureSchemaComponentURNType}:${featureKind}:${featureName}`;

export type FeatureSchemaComponent<
  FeatureKind extends string = string,
  FeatureName extends string = string,
> = SchemaComponent<
  FeatureSchemaComponentURN<FeatureKind, FeatureName>,
  Readonly<{
    featureKind: FeatureKind;
    featureName: FeatureName;
    visibility: FeatureSchemaComponentVisibility;
    featureScope?: FeatureSchemaComponentScope | undefined;
  }>
>;

export type FeatureSchemaComponentOptions<
  FeatureKind extends string = string,
  FeatureName extends string = string,
> = {
  featureKind: FeatureKind;
  featureName: FeatureName;
  visibility?: FeatureSchemaComponentVisibility;
  featureScope?: FeatureSchemaComponentScope;
} & SchemaComponentOptions;

export const featureSchemaComponent = <
  const FeatureKind extends string = string,
  const FeatureName extends string = string,
>({
  featureKind,
  featureName,
  visibility = 'opaque',
  featureScope,
  ...options
}: FeatureSchemaComponentOptions<
  FeatureKind,
  FeatureName
>): FeatureSchemaComponent<FeatureKind, FeatureName> => ({
  ...schemaComponent(FeatureSchemaComponentURN({ featureKind, featureName }), {
    ...(options.migrations !== undefined
      ? { migrations: options.migrations }
      : {}),
    ...(options.components !== undefined
      ? { components: options.components }
      : {}),
  }),
  featureKind,
  featureName,
  visibility,
  featureScope,
});

export const isFeatureSchemaComponent = (
  component: SchemaComponent,
): component is FeatureSchemaComponent =>
  component.schemaComponentKey.startsWith(`${FeatureSchemaComponentURNType}:`);

export type DatabaseFeatureSchemaComponent<
  FeatureKind extends string = string,
  FeatureName extends string = string,
> = FeatureSchemaComponent<FeatureKind, FeatureName> & {
  featureScope: 'database';
};

export type DatabaseSchemaFeatureSchemaComponent<
  FeatureKind extends string = string,
  FeatureName extends string = string,
> = FeatureSchemaComponent<FeatureKind, FeatureName> & {
  featureScope: 'database_schema';
};

export const databaseFeatureSchemaComponent = <
  const FeatureKind extends string = string,
  const FeatureName extends string = string,
>(
  options: Omit<
    FeatureSchemaComponentOptions<FeatureKind, FeatureName>,
    'featureScope'
  >,
): DatabaseFeatureSchemaComponent<FeatureKind, FeatureName> =>
  featureSchemaComponent({
    ...options,
    featureScope: 'database',
  } as FeatureSchemaComponentOptions<
    FeatureKind,
    FeatureName
  >) as DatabaseFeatureSchemaComponent<FeatureKind, FeatureName>;

export const databaseSchemaFeatureSchemaComponent = <
  const FeatureKind extends string = string,
  const FeatureName extends string = string,
>(
  options: Omit<
    FeatureSchemaComponentOptions<FeatureKind, FeatureName>,
    'featureScope'
  >,
): DatabaseSchemaFeatureSchemaComponent<FeatureKind, FeatureName> =>
  featureSchemaComponent({
    ...options,
    featureScope: 'database_schema',
  } as FeatureSchemaComponentOptions<
    FeatureKind,
    FeatureName
  >) as DatabaseSchemaFeatureSchemaComponent<FeatureKind, FeatureName>;
