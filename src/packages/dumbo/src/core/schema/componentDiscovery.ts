import {
  isFeatureSchemaComponent,
  type FeatureSchemaComponent,
} from './featureSchemaComponent';
import { expandSchemaComponent } from './expandSchemaComponent';
import type { AnySchemaComponent } from './schemaComponent';

export type SchemaComponentPredicate<T extends AnySchemaComponent> = (
  component: AnySchemaComponent,
) => component is T;

export function findComponents<T extends AnySchemaComponent>(
  root: AnySchemaComponent,
  predicate: SchemaComponentPredicate<T>,
): T[];
export function findComponents<
  T extends AnySchemaComponent = AnySchemaComponent,
>(root: AnySchemaComponent, keyPrefix: string): T[];
export function findComponents<
  T extends AnySchemaComponent = AnySchemaComponent,
>(
  root: AnySchemaComponent,
  predicateOrPrefix: string | SchemaComponentPredicate<T>,
): T[] {
  const results: T[] = [];

  const matches =
    typeof predicateOrPrefix === 'string'
      ? (component: AnySchemaComponent): component is T =>
          component.schemaComponentKey.startsWith(predicateOrPrefix)
      : predicateOrPrefix;

  const visit = (component: AnySchemaComponent) => {
    if (matches(component)) {
      results.push(component);
    }

    const childComponents = isFeatureSchemaComponent(component)
      ? expandSchemaComponent(component).components
      : component.components;

    for (const child of childComponents.values()) {
      visit(child);
    }
  };

  visit(root);

  return results;
}

export const findComponent = <
  T extends AnySchemaComponent = AnySchemaComponent,
>(
  root: AnySchemaComponent,
  key: string,
): T | undefined =>
  findComponents<T>(
    root,
    (component): component is T => component.schemaComponentKey === key,
  )[0];

export const findFeatures = <
  T extends FeatureSchemaComponent = FeatureSchemaComponent,
>(
  root: AnySchemaComponent,
  featureKind?: string,
): T[] =>
  findComponents<T>(
    root,
    (component): component is T =>
      isFeatureSchemaComponent(component) &&
      (featureKind === undefined || component.featureKind === featureKind),
  );

export const findFeature = <
  T extends FeatureSchemaComponent = FeatureSchemaComponent,
>(
  root: AnySchemaComponent,
  featureKind: string,
  featureName?: string,
): T | undefined =>
  findFeatures<T>(root, featureKind).find(
    (feature) =>
      featureName === undefined || feature.featureName === featureName,
  );

export function requireSingleComponent<T extends AnySchemaComponent>(
  root: AnySchemaComponent,
  predicate: SchemaComponentPredicate<T>,
  label?: string,
): T;
export function requireSingleComponent<
  T extends AnySchemaComponent = AnySchemaComponent,
>(root: AnySchemaComponent, keyPrefix: string, label?: string): T;
export function requireSingleComponent<
  T extends AnySchemaComponent = AnySchemaComponent,
>(
  root: AnySchemaComponent,
  predicateOrPrefix: string | SchemaComponentPredicate<T>,
  label = 'schema component',
): T {
  const matches =
    typeof predicateOrPrefix === 'string'
      ? findComponents<T>(root, predicateOrPrefix)
      : findComponents<T>(root, predicateOrPrefix);

  if (matches.length === 1) return matches[0] as T;

  const keys = matches.map((component) => component.schemaComponentKey);

  if (matches.length === 0) {
    throw new Error(`Expected one ${label}, found none`);
  }

  throw new Error(
    `Expected one ${label}, found ${matches.length}: ${keys.join(', ')}`,
  );
}
