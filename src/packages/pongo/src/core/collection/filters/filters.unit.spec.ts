import { describe, expect, it } from 'vitest';
import { idFromFilter, getIdsFromIdOnlyFilter } from './filters';

describe('idFromFilter', () => {
  it('returns the id string for a single { _id: string } filter', () => {
    expect(idFromFilter({ _id: 'abc' })).toBe('abc');
  });

  it('returns undefined when filter has extra keys', () => {
    expect(
      idFromFilter({ _id: 'abc', name: 'Alice' } as never),
    ).toBeUndefined();
  });

  it('returns undefined when _id is not a string', () => {
    expect(idFromFilter({ _id: { $ne: 'abc' } })).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(idFromFilter(undefined)).toBeUndefined();
  });

  it('returns undefined for a raw SQL string', () => {
    const sql = 'SELECT 1' as Parameters<typeof idFromFilter>[0];
    expect(idFromFilter(sql)).toBeUndefined();
  });

  it('returns undefined for an empty filter', () => {
    expect(idFromFilter({})).toBeUndefined();
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

  it('returns undefined when filter has extra keys', () => {
    expect(
      getIdsFromIdOnlyFilter({ _id: { $in: ['a'] }, name: 'x' } as never),
    ).toBeUndefined();
  });

  it('returns undefined when $in contains non-strings', () => {
    expect(
      getIdsFromIdOnlyFilter({ _id: { $in: ['a', 2] } } as never),
    ).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(getIdsFromIdOnlyFilter(undefined)).toBeUndefined();
  });

  it('returns an empty array for { _id: { $in: [] } }', () => {
    expect(getIdsFromIdOnlyFilter({ _id: { $in: [] } })).toEqual([]);
  });
});
