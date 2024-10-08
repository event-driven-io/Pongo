import chalk from 'chalk';

const TWO_SPACES = '  ';

const COLOR_STRING = chalk.hex('#98c379'); // Soft green for strings
const COLOR_KEY = chalk.hex('#61afef'); // Muted cyan for keys
const COLOR_NUMBER_OR_DATE = chalk.hex('#d19a66'); // Light orange for numbers
const COLOR_BOOLEAN = chalk.hex('#c678dd'); // Light purple for booleans
const COLOR_NULL_OR_UNDEFINED = chalk.hex('#c678dd'); // Light purple for null
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shouldPrint = (obj: any): boolean =>
  typeof obj !== 'function' && typeof obj !== 'symbol';

const formatJson = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any,
  indentLevel: number = 0,
  handleMultiline: boolean = false,
): string => {
  const indent = TWO_SPACES.repeat(indentLevel);

  if (obj === null) return COLOR_NULL_OR_UNDEFINED('null');

  if (obj === undefined) return COLOR_NULL_OR_UNDEFINED('undefined');

  if (typeof obj === 'string')
    return processString(obj, indent, handleMultiline);
  if (typeof obj === 'number' || typeof obj === 'bigint' || obj instanceof Date)
    return COLOR_NUMBER_OR_DATE(String(obj));
  if (typeof obj === 'boolean') return COLOR_BOOLEAN(String(obj));

  if (obj instanceof Error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorObj: Record<string, any> = {};

    const propNames = Object.getOwnPropertyNames(obj);

    propNames.forEach((key) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      errorObj[key] = (obj as any)[key];
    });

    return formatJson(errorObj, indentLevel, handleMultiline);
  }

  if (obj instanceof Promise) {
    return COLOR_STRING('Promise {pending}');
  }

  if (Array.isArray(obj)) {
    const arrayItems = obj.map((item) =>
      formatJson(item, indentLevel + 1, handleMultiline),
    );
    return `${COLOR_BRACKETS('[')}\n${indent}  ${arrayItems.join(
      `,\n${indent}  `,
    )}\n${indent}${COLOR_BRACKETS(']')}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const entries = Object.entries(obj)
    .filter(([_, value]) => shouldPrint(value))
    .map(
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

export const prettyJson = (
  obj: unknown,
  options?: { handleMultiline?: boolean },
): string => formatJson(obj, 0, options?.handleMultiline);
