import { JSONSerializer } from '../serializer';

export const tracer = () => {};

export type LogLevel = 'DISABLED' | 'INFO' | 'LOG' | 'WARN' | 'ERROR';
export const LogLevel = {
  DISABLED: 'DISABLED' as LogLevel,
  INFO: 'INFO' as LogLevel,
  LOG: 'LOG' as LogLevel,
  WARN: 'WARN' as LogLevel,
  ERROR: 'ERROR' as LogLevel,
};

const shouldLog = (logLevel: LogLevel): boolean => {
  const definedLogLevel = process.env.DUMBO_LOG_LEVEL ?? LogLevel.DISABLED;

  if (definedLogLevel === LogLevel.ERROR && logLevel === LogLevel.ERROR)
    return true;

  if (
    definedLogLevel === LogLevel.WARN &&
    [LogLevel.ERROR, LogLevel.WARN].includes(logLevel)
  )
    return true;

  if (
    definedLogLevel === LogLevel.LOG &&
    [LogLevel.ERROR, LogLevel.WARN, LogLevel.LOG].includes(logLevel)
  )
    return true;

  if (
    definedLogLevel === LogLevel.INFO &&
    [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO].includes(logLevel)
  )
    return true;

  return false;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
tracer.log = (eventName: string, attributes?: Record<string, any>) => {
  if (!shouldLog(LogLevel.LOG)) return;

  console.log(
    JSONSerializer.serialize({
      name: eventName,
      timestamp: new Date().getTime(),
      ...attributes,
    }),
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
tracer.warn = (eventName: string, attributes?: Record<string, any>) => {
  if (!shouldLog(LogLevel.WARN)) return;

  console.warn(
    JSONSerializer.serialize({
      name: eventName,
      timestamp: new Date().getTime(),
      ...attributes,
    }),
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
tracer.error = (eventName: string, attributes?: Record<string, any>) => {
  if (!shouldLog(LogLevel.ERROR)) return;

  console.error(
    JSONSerializer.serialize({
      name: eventName,
      timestamp: new Date().getTime(),
      ...attributes,
    }),
  );
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
tracer.info = (eventName: string, attributes?: Record<string, any>) => {
  if (!shouldLog(LogLevel.INFO)) return;

  console.info(
    JSONSerializer.serialize({
      name: eventName,
      timestamp: new Date().getTime(),
      ...attributes,
    }),
  );
};
