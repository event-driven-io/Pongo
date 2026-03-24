import { describe, expect, it } from 'vitest';
import { idFromFilter, getIdsFromIdOnlyFilter } from './filters';

describe('idFromFilter', () => {
  it('returns the id string for a single { _id: string } filter', () => {
    expect(idFromFilter({ _id: 'abc' })).toBe('abc');
  });

  it('returns null when filter has extra keys', () => {
    expect(idFromFilter({ _id: 'abc', name: 'Alice' } as never)).toBeNull();
  });

  it('returns null when _id is not a string', () => {
    expect(idFromFilter({ _id: { $ne: 'abc' } })).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(idFromFilter(undefined)).toBeNull();
  });

  it('returns null for a raw SQL string', () => {
    const sql = 'SELECT 1' as Parameters<typeof idFromFilter>[0];
    expect(idFromFilter(sql)).toBeNull();
  });

  it('returns null for an empty filter', () => {
    expect(idFromFilter({})).toBeNull();
  });
});

describe('getIdsFromIdOnlyFilter', () => {
  it('returns the id array for { _id: { $in: [...] } }', () => {
    expect(getIdsFromIdOnlyFilter({ _id: { $in: ['a', 'b', 'c'] } })).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('returns single-element array for { _id: string }', () => {
    expect(getIdsFromIdOnlyFilter({ _id: 'abc' })).toEqual(['abc']);
  });

  it('returns null when filter has extra keys', () => {
    expect(
      getIdsFromIdOnlyFilter({ _id: { $in: ['a'] }, name: 'x' } as never),
    ).toBeNull();
  });

  it('returns null when $in contains non-strings', () => {
    expect(
      getIdsFromIdOnlyFilter({ _id: { $in: ['a', 2] } } as never),
    ).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(getIdsFromIdOnlyFilter(undefined)).toBeNull();
  });

  it('returns an empty array for { _id: { $in: [] } }', () => {
    expect(getIdsFromIdOnlyFilter({ _id: { $in: [] } })).toEqual([]);
  });
});
