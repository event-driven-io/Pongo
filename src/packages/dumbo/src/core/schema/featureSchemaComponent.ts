import {
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from './schemaComponent';

export type FeatureSchemaComponentVisibility = 'opaque' | 'expanded';

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
  }>
>;

export type FeatureSchemaComponentOptions<
  FeatureKind extends string = string,
  FeatureName extends string = string,
> = {
  featureKind: FeatureKind;
  featureName: FeatureName;
  visibility?: FeatureSchemaComponentVisibility;
} & SchemaComponentOptions;

export const featureSchemaComponent = <
  const FeatureKind extends string = string,
  const FeatureName extends string = string,
>({
  featureKind,
  featureName,
  visibility = 'opaque',
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
});

export const isFeatureSchemaComponent = (
  component: SchemaComponent,
): component is FeatureSchemaComponent =>
  component.schemaComponentKey.startsWith(`${FeatureSchemaComponentURNType}:`);
