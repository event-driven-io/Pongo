import { describe, expect, it } from 'vitest';
import { sqlite3Driver } from './index';

describe('SQLite3 Pongo driver', () => {
  it('exposes the SQLite3 driver identity and Dumbo driver', () => {
    expect(sqlite3Driver.driverType).toBe('SQLite:sqlite3');
    expect(sqlite3Driver.dumboDriver.driverType).toBe('SQLite:sqlite3');
  });
});
