import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PongoDocument } from '../../typing/operations';
import { identityMapCache } from '../providers';
import { lruCache } from '../providers/lruCache';
import {
  pongoTransactionCache,
  type PongoTransactionCache,
} from './pongoTransactionCache';
import type { PongoCache, PongoDocumentCacheKey } from '../types';

const key = (id: string): PongoDocumentCacheKey => `db:users:${id}`;

describe('pongoTransactionCache', () => {
  let mainCache: PongoCache;
  let txCache: PongoTransactionCache;

  beforeEach(() => {
    mainCache = lruCache({ max: 100 });
    txCache = pongoTransactionCache();
  });

  describe('type', () => {
    it('exposes the transaction-buffer cache type', () => {
      expect(txCache.type).toBe('pongo:cache:transaction-buffer');
    });
  });

  describe('get / set', () => {
    it('returns null for a key that was never set', async () => {
      expect(await txCache.get(key('missing'))).toBeNull();
    });

    it('returns the document after set', async () => {
      const doc: PongoDocument = { _id: '1', name: 'Alice' };
      await txCache.set(key('1'), doc, { mainCache });

      expect(await txCache.get(key('1'))).toEqual(doc);
    });

    it('does not write to mainCache on set (buffered)', async () => {
      const doc: PongoDocument = { _id: '1', name: 'Alice' };
      await txCache.set(key('1'), doc, { mainCache });

      expect(await mainCache.get(key('1'))).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes the document from the inner cache', async () => {
      const doc: PongoDocument = { _id: '1', name: 'Alice' };
      await txCache.set(key('1'), doc, { mainCache });
      await txCache.delete(key('1'), { mainCache });

      expect(await txCache.get(key('1'))).toBeNull();
    });

    it('does not delete from mainCache until commit', async () => {
      await mainCache.set(key('1'), { _id: '1', name: 'Alice' });
      await txCache.delete(key('1'), { mainCache });

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'Alice',
      });
    });
  });

  describe('update', () => {
    it('applies update to inner cache immediately', async () => {
      const doc: PongoDocument = { _id: '1', name: 'Alice' };
      await txCache.set(key('1'), doc, { mainCache });
      await txCache.update(key('1'), { $set: { name: 'Bob' } }, { mainCache });

      // identityMapCache's update deletes the key (TODO behavior)
      expect(await txCache.get(key('1'))).toBeNull();
    });

    it('does not apply update to mainCache until commit', async () => {
      await mainCache.set(key('1'), { _id: '1', name: 'Alice' });
      await txCache.update(key('1'), { $set: { name: 'Bob' } }, { mainCache });

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'Alice',
      });
    });
  });

  describe('getMany / setMany', () => {
    it('returns null for all missing keys', async () => {
      const results = await txCache.getMany([key('a'), key('b')]);
      expect(results).toEqual([null, null]);
    });

    it('stores and retrieves multiple documents', async () => {
      const entries = [
        { key: key('a'), value: { _id: 'a', name: 'A' } },
        { key: key('b'), value: { _id: 'b', name: 'B' } },
      ];
      await txCache.setMany(entries, { mainCache });

      const results = await txCache.getMany([key('a'), key('b')]);
      expect(results).toEqual([
        { _id: 'a', name: 'A' },
        { _id: 'b', name: 'B' },
      ]);
    });

    it('does not write to mainCache on setMany', async () => {
      await txCache.setMany(
        [{ key: key('a'), value: { _id: 'a', name: 'A' } }],
        { mainCache },
      );

      expect(await mainCache.get(key('a'))).toBeNull();
    });
  });

  describe('updateMany', () => {
    it('applies update to inner cache for all keys', async () => {
      await txCache.setMany(
        [
          { key: key('a'), value: { _id: 'a', name: 'A' } },
          { key: key('b'), value: { _id: 'b', name: 'B' } },
        ],
        { mainCache },
      );
      await txCache.updateMany(
        [key('a'), key('b')],
        { $set: { name: 'Updated' } },
        { mainCache },
      );

      // identityMapCache's updateMany deletes keys (TODO behavior)
      const results = await txCache.getMany([key('a'), key('b')]);
      expect(results).toEqual([null, null]);
    });

    it('does not apply updateMany to mainCache until commit', async () => {
      await mainCache.set(key('a'), { _id: 'a', name: 'A' });
      await txCache.updateMany(
        [key('a')],
        { $set: { name: 'Updated' } },
        { mainCache },
      );

      expect(await mainCache.get(key('a'))).toEqual({ _id: 'a', name: 'A' });
    });
  });

  describe('deleteMany', () => {
    it('removes multiple documents from inner cache', async () => {
      await txCache.setMany(
        [
          { key: key('a'), value: { _id: 'a' } },
          { key: key('b'), value: { _id: 'b' } },
        ],
        { mainCache },
      );
      await txCache.deleteMany([key('a'), key('b')], { mainCache });

      const results = await txCache.getMany([key('a'), key('b')]);
      expect(results).toEqual([null, null]);
    });

    it('does not delete from mainCache until commit', async () => {
      await mainCache.set(key('a'), { _id: 'a' });
      await mainCache.set(key('b'), { _id: 'b' });
      await txCache.deleteMany([key('a'), key('b')], { mainCache });

      expect(await mainCache.get(key('a'))).toEqual({ _id: 'a' });
      expect(await mainCache.get(key('b'))).toEqual({ _id: 'b' });
    });
  });

  describe('clear (rollback)', () => {
    it('empties the inner cache', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'Alice' }, { mainCache });
      await txCache.clear();

      expect(await txCache.get(key('1'))).toBeNull();
    });

    it('discards all buffered operations so commit becomes a no-op', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'Alice' }, { mainCache });
      await txCache.clear();
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toBeNull();
    });

    it('does not affect mainCache', async () => {
      await mainCache.set(key('1'), { _id: '1', name: 'Original' });
      await txCache.set(
        key('1'),
        { _id: '1', name: 'Transactional' },
        { mainCache },
      );
      await txCache.clear();

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'Original',
      });
    });
  });

  describe('commit', () => {
    it('replays set operations to mainCache', async () => {
      const doc: PongoDocument = { _id: '1', name: 'Alice' };
      await txCache.set(key('1'), doc, { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toEqual(doc);
    });

    it('replays setMany operations to mainCache', async () => {
      const entries = [
        { key: key('a'), value: { _id: 'a', name: 'A' } },
        { key: key('b'), value: { _id: 'b', name: 'B' } },
      ];
      await txCache.setMany(entries, { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('a'))).toEqual({ _id: 'a', name: 'A' });
      expect(await mainCache.get(key('b'))).toEqual({ _id: 'b', name: 'B' });
    });

    it('replays delete operations to mainCache', async () => {
      await mainCache.set(key('1'), { _id: '1', name: 'Alice' });
      await txCache.delete(key('1'), { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toBeNull();
    });

    it('replays deleteMany operations to mainCache', async () => {
      await mainCache.set(key('a'), { _id: 'a' });
      await mainCache.set(key('b'), { _id: 'b' });
      await txCache.deleteMany([key('a'), key('b')], { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('a'))).toBeNull();
      expect(await mainCache.get(key('b'))).toBeNull();
    });

    it('replays update operations to mainCache', async () => {
      await mainCache.set(key('1'), { _id: '1', name: 'Alice' });
      await txCache.update(key('1'), { $set: { name: 'Bob' } }, { mainCache });
      await txCache.commit();

      // lruCache's update deletes the key (TODO behavior)
      expect(await mainCache.get(key('1'))).toBeNull();
    });

    it('replays updateMany operations to mainCache', async () => {
      await mainCache.set(key('a'), { _id: 'a', name: 'A' });
      await mainCache.set(key('b'), { _id: 'b', name: 'B' });
      await txCache.updateMany(
        [key('a'), key('b')],
        { $set: { name: 'Updated' } },
        { mainCache },
      );
      await txCache.commit();

      // lruCache's updateMany deletes keys (TODO behavior)
      expect(await mainCache.get(key('a'))).toBeNull();
      expect(await mainCache.get(key('b'))).toBeNull();
    });

    it('replays operations in order across mixed types', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'First' }, { mainCache });
      await txCache.set(
        key('1'),
        { _id: '1', name: 'Overwritten' },
        { mainCache },
      );
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'Overwritten',
      });
    });

    it('clears the inner cache after commit', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'Alice' }, { mainCache });
      await txCache.commit();

      expect(await txCache.get(key('1'))).toBeNull();
    });

    it('clears the operation buffer after commit (second commit is a no-op)', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'Alice' }, { mainCache });
      await txCache.commit();

      await mainCache.delete(key('1'));
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toBeNull();
    });

    it('can commit to different mainCaches per operation', async () => {
      const otherMainCache = lruCache({ max: 100 });

      await txCache.set(key('1'), { _id: '1', name: 'ForMain' }, { mainCache });
      await txCache.set(
        key('2'),
        { _id: '2', name: 'ForOther' },
        { mainCache: otherMainCache },
      );
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'ForMain',
      });
      expect(await otherMainCache.get(key('2'))).toEqual({
        _id: '2',
        name: 'ForOther',
      });
      expect(await mainCache.get(key('2'))).toBeNull();
    });
  });

  describe('set with options forwarding', () => {
    it('forwards ttl option to mainCache on commit', async () => {
      const setSpy = vi.fn();
      const spyMainCache: PongoCache = {
        ...identityMapCache(),
        set: setSpy,
      };

      await txCache.set(
        key('1'),
        { _id: '1' },
        { mainCache: spyMainCache, ttl: 5000 },
      );
      await txCache.commit();

      expect(setSpy).toHaveBeenCalledWith(
        key('1'),
        { _id: '1' },
        { ttl: 5000 },
      );
    });
  });

  describe('custom inner cache', () => {
    it('accepts a custom cache provider for the inner buffer', async () => {
      const customInner = lruCache({ max: 10 });
      const customTxCache = pongoTransactionCache({ cache: customInner });

      await customTxCache.set(
        key('1'),
        { _id: '1', name: 'Custom' },
        { mainCache },
      );
      expect(await customTxCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'Custom',
      });
    });
  });

  describe('operation sequencing on commit', () => {
    it('set → delete: doc absent after commit', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'Alice' }, { mainCache });
      await txCache.delete(key('1'), { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toBeNull();
    });

    it('delete → set: doc present after commit', async () => {
      await mainCache.set(key('1'), { _id: '1', name: 'Original' });
      await txCache.delete(key('1'), { mainCache });
      await txCache.set(key('1'), { _id: '1', name: 'Revived' }, { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'Revived',
      });
    });

    it('set → delete → set: last set wins after commit', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'First' }, { mainCache });
      await txCache.delete(key('1'), { mainCache });
      await txCache.set(key('1'), { _id: '1', name: 'Second' }, { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'Second',
      });
    });

    it('delete → set → delete: doc absent after commit', async () => {
      await mainCache.set(key('1'), { _id: '1', name: 'Original' });
      await txCache.delete(key('1'), { mainCache });
      await txCache.set(
        key('1'),
        { _id: '1', name: 'Temporary' },
        { mainCache },
      );
      await txCache.delete(key('1'), { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toBeNull();
    });

    it('set → set → delete → set: last set wins after commit', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'V1' }, { mainCache });
      await txCache.set(key('1'), { _id: '1', name: 'V2' }, { mainCache });
      await txCache.delete(key('1'), { mainCache });
      await txCache.set(key('1'), { _id: '1', name: 'V3' }, { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'V3',
      });
    });

    it('setMany → deleteMany: all docs absent after commit', async () => {
      await txCache.setMany(
        [
          { key: key('a'), value: { _id: 'a', name: 'A' } },
          { key: key('b'), value: { _id: 'b', name: 'B' } },
        ],
        { mainCache },
      );
      await txCache.deleteMany([key('a'), key('b')], { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('a'))).toBeNull();
      expect(await mainCache.get(key('b'))).toBeNull();
    });

    it('deleteMany → setMany: docs present after commit', async () => {
      await mainCache.set(key('a'), { _id: 'a', name: 'OldA' });
      await mainCache.set(key('b'), { _id: 'b', name: 'OldB' });
      await txCache.deleteMany([key('a'), key('b')], { mainCache });
      await txCache.setMany(
        [
          { key: key('a'), value: { _id: 'a', name: 'NewA' } },
          { key: key('b'), value: { _id: 'b', name: 'NewB' } },
        ],
        { mainCache },
      );
      await txCache.commit();

      expect(await mainCache.get(key('a'))).toEqual({
        _id: 'a',
        name: 'NewA',
      });
      expect(await mainCache.get(key('b'))).toEqual({
        _id: 'b',
        name: 'NewB',
      });
    });

    it('mixed single and bulk ops on same key: last operation wins', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'Single' }, { mainCache });
      await txCache.deleteMany([key('1')], { mainCache });
      await txCache.setMany(
        [{ key: key('1'), value: { _id: '1', name: 'Bulk' } }],
        { mainCache },
      );
      await txCache.delete(key('1'), { mainCache });
      await txCache.set(
        key('1'),
        { _id: '1', name: 'FinalSingle' },
        { mainCache },
      );
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'FinalSingle',
      });
    });

    it('operations on independent keys do not interfere', async () => {
      await txCache.set(key('a'), { _id: 'a', name: 'A' }, { mainCache });
      await txCache.delete(key('b'), { mainCache });
      await txCache.set(key('b'), { _id: 'b', name: 'B' }, { mainCache });
      await txCache.delete(key('a'), { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('a'))).toBeNull();
      expect(await mainCache.get(key('b'))).toEqual({ _id: 'b', name: 'B' });
    });

    it('set → update → delete → set: replays all four in order', async () => {
      await txCache.set(key('1'), { _id: '1', name: 'V1' }, { mainCache });
      await txCache.update(key('1'), { $set: { name: 'V2' } }, { mainCache });
      await txCache.delete(key('1'), { mainCache });
      await txCache.set(key('1'), { _id: '1', name: 'V3' }, { mainCache });
      await txCache.commit();

      expect(await mainCache.get(key('1'))).toEqual({
        _id: '1',
        name: 'V3',
      });
    });
  });
});
