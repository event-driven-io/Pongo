import {
  isFeatureSchemaComponent,
  type FeatureSchemaComponent,
} from './featureSchemaComponent';
import {
  findSchemaComponentsOfType,
  type AnySchemaComponent,
  type SchemaComponent,
} from './schemaComponent';

const addExpandedComponent = (
  components: Map<string, AnySchemaComponent>,
  component: AnySchemaComponent,
) => {
  if (components.has(component.schemaComponentKey)) {
    throw new Error(
      `Duplicate expanded schema component key: ${component.schemaComponentKey}`,
    );
  }

  components.set(component.schemaComponentKey, component);
};

const expandChildComponent = (
  child: AnySchemaComponent,
  components: Map<string, AnySchemaComponent>,
) => {
  const expanded = expandSchemaComponent(child);

  if (!isFeatureSchemaComponent(child)) {
    addExpandedComponent(components, expanded);
    return;
  }

  for (const featureChild of expanded.components.values()) {
    addExpandedComponent(components, featureChild);
  }
};

export const expandSchemaComponent = <T extends AnySchemaComponent>(
  component: T,
): T => {
  const expandedComponents = new Map<string, AnySchemaComponent>();

  for (const child of component.components.values()) {
    expandChildComponent(child, expandedComponents);
  }

  return {
    ...component,
    components: expandedComponents,
  };
};

export const expandFeatureSchemaComponent = <
  T extends FeatureSchemaComponent,
>(
  component: T,
): SchemaComponent<T['schemaComponentKey']> => expandSchemaComponent(component);

export const findExpandedSchemaComponentsOfType = <
  T extends AnySchemaComponent,
>(
  root: AnySchemaComponent,
  prefix: string,
): T[] => findSchemaComponentsOfType<T>(expandSchemaComponent(root), prefix);
