import { describe, expect, it } from 'vitest';
import { d1Driver } from './index';

describe('D1 Pongo driver', () => {
  it('exposes the D1 driver identity and Dumbo driver', () => {
    expect(d1Driver.driverType).toBe('SQLite:d1');
    expect(d1Driver.dumboDriver.driverType).toBe('SQLite:d1');
  });
});
