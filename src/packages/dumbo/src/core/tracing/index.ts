import { JSONSerializer } from '../serializer';
import { prettyJson } from './printing';

export const tracer = () => {};

export type LogLevel = 'DISABLED' | 'INFO' | 'LOG' | 'WARN' | 'ERROR';

export const LogLevel = {
  DISABLED: 'DISABLED' as LogLevel,
  INFO: 'INFO' as LogLevel,
  LOG: 'LOG' as LogLevel,
  WARN: 'WARN' as LogLevel,
  ERROR: 'ERROR' as LogLevel,
};

export type LogType = 'CONSOLE';

export type LogStyle = 'RAW' | 'PRETTY';

export const LogStyle = {
  RAW: 'RAW' as LogStyle,
  PRETTY: 'PRETTY' as LogStyle,
};

const getEnvVariable = (name: string): string | undefined => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const shouldLog = (logLevel: LogLevel): boolean => {
  const definedLogLevel =
    getEnvVariable('DUMBO_LOG_LEVEL') ?? LogLevel.DISABLED;

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
    [LogLevel.ERROR, LogLevel.WARN, LogLevel.LOG, LogLevel.INFO].includes(
      logLevel,
    )
  )
    return true;

  return false;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TraceEventRecorder = (message?: any, ...optionalParams: any[]) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TraceEventFormatter = (event: any) => string;

const nulloTraceEventRecorder: TraceEventRecorder = () => {};

const getTraceEventFormatter =
  (
    logStyle: LogStyle,
    serializer: JSONSerializer = JSONSerializer,
  ): TraceEventFormatter =>
  (event) => {
    switch (logStyle) {
      case 'RAW':
        return serializer.serialize(event);
      case 'PRETTY':
        return prettyJson(event, { handleMultiline: true });
    }
  };

const getTraceEventRecorder = (
  logLevel: LogLevel,
  logStyle: LogStyle,
): TraceEventRecorder => {
  const format = getTraceEventFormatter(logStyle);
  switch (logLevel) {
    case 'DISABLED':
      return nulloTraceEventRecorder;
    case 'INFO':
      return (event) => console.info(format(event));
    case 'LOG':
      return (event) => console.log(format(event));
    case 'WARN':
      return (event) => console.warn(format(event));
    case 'ERROR':
      return (event) => console.error(format(event));
  }
};

const recordTraceEvent = (
  logLevel: LogLevel,
  eventName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: Record<string, any>,
) => {
  if (!shouldLog(LogLevel.LOG)) return;

  const event = {
    name: eventName,
    timestamp: new Date().getTime(),
    ...attributes,
  };

  const record = getTraceEventRecorder(
    logLevel,
    (getEnvVariable('DUMBO_LOG_STYLE') as LogStyle | undefined) ?? 'RAW',
  );

  record(event);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
tracer.info = (eventName: string, attributes?: Record<string, any>) =>
  recordTraceEvent(LogLevel.INFO, eventName, attributes);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
tracer.warn = (eventName: string, attributes?: Record<string, any>) =>
  recordTraceEvent(LogLevel.WARN, eventName, attributes);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
tracer.log = (eventName: string, attributes?: Record<string, any>) =>
  recordTraceEvent(LogLevel.LOG, eventName, attributes);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
tracer.error = (eventName: string, attributes?: Record<string, any>) =>
  recordTraceEvent(LogLevel.ERROR, eventName, attributes);

export * from './printing';
