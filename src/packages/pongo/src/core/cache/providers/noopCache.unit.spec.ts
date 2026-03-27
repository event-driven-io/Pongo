import { describe, expect, it } from 'vitest';
import { noopCacheProvider } from './noopCache';

describe('noopCacheProvider', () => {
  it('get always returns undefined', async () => {
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
  });

  it('set then get still returns undefined', async () => {
    noopCacheProvider.set('db:collection:a', { _id: 'a', name: 'Alice' });
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
  });

  it('update then get still returns undefined', async () => {
    noopCacheProvider.update('db:collection:a', { $set: { name: 'Alice' } });
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
  });

  it('delete does nothing', async () => {
    noopCacheProvider.delete('db:collection:a');
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
  });

  it('getMany returns undefined for every key', async () => {
    noopCacheProvider.set('db:collection:k1', { _id: 'k1' });
    noopCacheProvider.set('db:collection:k2', { _id: 'k2' });
    const results = await noopCacheProvider.getMany([
      'db:collection:k1',
      'db:collection:missing',
      'db:collection:k2',
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]).toBeUndefined();
    expect(results[1]).toBeUndefined();
    expect(results[2]).toBeUndefined();
  });

  it('setMany then get still returns undefined', async () => {
    await noopCacheProvider.setMany([
      { key: 'db:collection:a', value: { _id: 'a' } },
      { key: 'db:collection:b', value: { _id: 'b' } },
    ]);
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
    expect(await noopCacheProvider.get('db:collection:b')).toBeUndefined();
  });

  it('updateMany does nothing', async () => {
    await noopCacheProvider.updateMany(['db:collection:a', 'db:collection:b'], {
      $set: { name: 'updated' },
    });
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
    expect(await noopCacheProvider.get('db:collection:b')).toBeUndefined();
  });

  it('deleteMany does nothing', async () => {
    noopCacheProvider.deleteMany(['db:collection:a', 'db:collection:b']);
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
    expect(await noopCacheProvider.get('db:collection:b')).toBeUndefined();
  });

  it('clear does nothing', async () => {
    noopCacheProvider.clear();
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
  });

  it('replaceMany does nothing', async () => {
    await noopCacheProvider.replaceMany([
      { key: 'db:collection:a', value: { _id: 'a' } },
      { key: 'db:collection:b', value: null },
    ]);
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
    expect(await noopCacheProvider.get('db:collection:b')).toBeUndefined();
  });

  it('close does nothing', async () => {
    noopCacheProvider.close();
    expect(await noopCacheProvider.get('db:collection:a')).toBeUndefined();
  });
});
