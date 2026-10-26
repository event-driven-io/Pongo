/* @__NO_SIDE_EFFECTS__ */
export const withProps = <Target extends object, Props extends object>(
  target: Target,
  props: Props,
): Target & Props => Object.assign(target, props);
