import { SQLFormatter, registerFormatter } from '../../../../../core';
import reservedMap from './reserved';

const isReserved = (value: string): boolean => {
  return !!reservedMap[value.toUpperCase()];
};

// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
const mapIdentifier = (value: string): string => {
  if (value === undefined || value === null) {
    throw new Error('SQL identifier cannot be null or undefined');
  }

  const ident = value.toString().slice(0); // create copy

  // do not quote a valid, unquoted identifier
  if (/^[a-z_][a-z0-9_$]*$/.test(ident) && !isReserved(ident)) {
    return ident;
  }

  let quoted = '"';
  for (let i = 0; i < ident.length; i++) {
    const c = ident[i];
    quoted += c === '"' ? c + c : c;
  }
  quoted += '"';
  return quoted;
};

const pgFormatter: SQLFormatter = SQLFormatter({
  valueMapper: {
    mapDate: (value: Date): unknown =>
      value.toISOString().replace('T', ' ').replace('Z', '+00'),
    mapPlaceholder: (index: number): string => `$${index + 1}`,
    mapIdentifier,
  },
});

registerFormatter('PostgreSQL', pgFormatter);

// Export the original functions if needed
export { pgFormatter };
