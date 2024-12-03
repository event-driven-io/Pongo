import ansis from 'ansis';

let enableColors = true;

export const color = {
  set level(value: 0 | 1) {
    enableColors = value === 1;
  },
  hex:
    (value: string) =>
    (text: string): string =>
      enableColors ? ansis.hex(value)(text) : text,
  red: (value: string): string => (enableColors ? ansis.red(value) : value),
  green: (value: string): string => (enableColors ? ansis.green(value) : value),
  blue: (value: string): string => (enableColors ? ansis.blue(value) : value),
  cyan: (value: string): string => (enableColors ? ansis.cyan(value) : value),
  yellow: (value: string): string =>
    enableColors ? ansis.yellow(value) : value,
};

export default color;
