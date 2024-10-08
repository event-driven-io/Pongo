import chalk from 'chalk';

const TWO_SPACES = '  ';

const COLOR_STRING = chalk.hex('#98c379'); // Soft green for strings
const COLOR_KEY = chalk.hex('#61afef'); // Muted cyan for keys
const COLOR_NUMBER = chalk.hex('#d19a66'); // Light orange for numbers
const COLOR_BOOLEAN = chalk.hex('#c678dd'); // Light purple for booleans
const COLOR_NULL = chalk.hex('#c678dd'); // Light purple for null
const COLOR_BRACKETS = chalk.hex('#abb2bf'); // Soft white for object and array brackets

const processString = (
  str: string,
  indent: string,
  handleMultiline: boolean,
): string => {
  if (handleMultiline && str.includes('\n')) {
    const lines = str.split('\n');
    const indentedLines = lines.map(
      (line) => indent + TWO_SPACES + COLOR_STRING(line),
    );
    return (
      COLOR_STRING('"') +
      '\n' +
      indentedLines.join('\n') +
      '\n' +
      indent +
      COLOR_STRING('"')
    );
  }
  return COLOR_STRING(`"${str}"`);
};

// Function to format and colorize JSON by traversing it
const formatJson = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  indentLevel: number = 0,
  handleMultiline: boolean = false,
): string => {
  const indent = TWO_SPACES.repeat(indentLevel);

  if (obj === null) return COLOR_NULL('null');
  if (typeof obj === 'string')
    return processString(obj, indent, handleMultiline);
  if (typeof obj === 'number') return COLOR_NUMBER(String(obj));
  if (typeof obj === 'boolean') return COLOR_BOOLEAN(String(obj));

  // Handle arrays
  if (Array.isArray(obj)) {
    const arrayItems = obj.map((item) =>
      formatJson(item, indentLevel + 1, handleMultiline),
    );
    return `${COLOR_BRACKETS('[')}\n${indent}  ${arrayItems.join(
      `,\n${indent}  `,
    )}\n${indent}${COLOR_BRACKETS(']')}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const entries = Object.entries(obj).map(
    ([key, value]) =>
      `${COLOR_KEY(`"${key}"`)}: ${formatJson(
        value,
        indentLevel + 1,
        handleMultiline,
      )}`,
  );
  return `${COLOR_BRACKETS('{')}\n${indent}  ${entries.join(
    `,\n${indent}  `,
  )}\n${indent}${COLOR_BRACKETS('}')}`;
};

export const prettyPrintJson = (
  obj: unknown,
  handleMultiline: boolean = false,
): string => formatJson(obj, 0, handleMultiline);
