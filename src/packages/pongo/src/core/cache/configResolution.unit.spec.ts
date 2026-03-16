import { describe, expect, it } from 'vitest';
import { resolveCacheConfig } from './configResolution';

describe('resolveCacheConfig', () => {
  it('no config at any level returns default in-memory config', () => {
    const result = resolveCacheConfig();
    expect(result).toEqual({ type: 'in-memory', max: 1000 });
  });

  it('undefined at all levels inherits default', () => {
    const result = resolveCacheConfig(undefined, undefined, undefined);
    expect(result).toEqual({ type: 'in-memory', max: 1000 });
  });

  it('client sets config, collection undefined — inherits client config', () => {
    const result = resolveCacheConfig({ type: 'in-memory', max: 500 }, undefined, undefined);
    expect(result).toEqual({ type: 'in-memory', max: 500 });
  });

  it('collection sets disabled — resolved is disabled', () => {
    const result = resolveCacheConfig({ type: 'in-memory', max: 500 }, undefined, 'disabled');
    expect(result).toBe('disabled');
  });

  it('client sets disabled — resolved is disabled even with child undefined', () => {
    const result = resolveCacheConfig('disabled', undefined, undefined);
    expect(result).toBe('disabled');
  });

  it('child config inherits parent max and ttl when only overriding type params', () => {
    const result = resolveCacheConfig(
      { type: 'in-memory', max: 500, ttl: 60000 },
      undefined,
      { type: 'in-memory', max: 200 },
    );
    expect(result).toEqual({ type: 'in-memory', max: 200, ttl: 60000 });
  });

  it('type-specific params reset when child switches type', () => {
    const result = resolveCacheConfig(
      { type: 'redis', max: 500, host: 'localhost' },
      undefined,
      { type: 'in-memory' },
    );
    expect(result).toEqual({ type: 'in-memory', max: 500 });
    expect((result as Record<string, unknown>).host).toBeUndefined();
  });

  it('full cascade: client → db → collection with various overrides', () => {
    const result = resolveCacheConfig(
      { type: 'in-memory', max: 1000, ttl: 30000 },
      { type: 'in-memory', max: 500 },
      { type: 'in-memory', ttl: 10000 },
    );
    expect(result).toEqual({ type: 'in-memory', max: 500, ttl: 10000 });
  });

  it('disabled at db level disables for collection too', () => {
    const result = resolveCacheConfig(
      { type: 'in-memory', max: 1000 },
      'disabled',
      undefined,
    );
    expect(result).toBe('disabled');
  });

  it('collection can re-enable after db disabled', () => {
    const result = resolveCacheConfig(
      { type: 'in-memory', max: 1000 },
      'disabled',
      { type: 'in-memory', max: 200 },
    );
    expect(result).toEqual({ type: 'in-memory', max: 200 });
  });
});
