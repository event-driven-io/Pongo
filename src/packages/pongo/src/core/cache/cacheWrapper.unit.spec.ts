import { describe, expect, it, vi } from 'vitest';
import { pongoCacheWrapper } from './cacheWrapper';
import { identityMapCache } from './providers';

const dbName = 'mydb';
const collectionName = 'users';

describe('pongoCacheWrapper — key prefixing', () => {
  it('get prefixes key', () => {
    const provider = identityMapCache();
    const spy = vi.spyOn(provider, 'get');
    const wrapper = pongoCacheWrapper({ provider });
    wrapper.get(`${dbName}:${collectionName}:doc1`);
    expect(spy).toHaveBeenCalledWith('mydb:users:doc1');
  });

  it('set prefixes key', () => {
    const provider = identityMapCache();
    const spy = vi.spyOn(provider, 'set');
    const wrapper = pongoCacheWrapper({ provider });
    wrapper.set(`${dbName}:${collectionName}:doc1`, { _id: 'doc1' });
    expect(spy).toHaveBeenCalledWith(
      'mydb:users:doc1',
      { _id: 'doc1' },
      undefined,
    );
  });

  it('delete prefixes key', () => {
    const provider = identityMapCache();
    const spy = vi.spyOn(provider, 'delete');
    const wrapper = pongoCacheWrapper({ provider });
    wrapper.delete(`${dbName}:${collectionName}:doc1`);
    expect(spy).toHaveBeenCalledWith('mydb:users:doc1');
  });

  it('getMany prefixes all keys', () => {
    const provider = identityMapCache();
    const spy = vi.spyOn(provider, 'getMany');
    const wrapper = pongoCacheWrapper({ provider });
    wrapper.getMany([
      `${dbName}:${collectionName}:a`,
      `${dbName}:${collectionName}:b`,
    ]);
    expect(spy).toHaveBeenCalledWith(['mydb:users:a', 'mydb:users:b']);
  });

  it('setMany prefixes all keys', () => {
    const provider = identityMapCache();
    const spy = vi.spyOn(provider, 'setMany');
    const wrapper = pongoCacheWrapper({ provider });
    wrapper.setMany([
      { key: `${dbName}:${collectionName}:a`, value: { _id: 'a' } },
    ]);
    expect(spy).toHaveBeenCalledWith([
      { key: 'mydb:users:a', value: { _id: 'a' }, ttl: undefined },
    ]);
  });

  it('deleteMany prefixes all keys', () => {
    const provider = identityMapCache();
    const spy = vi.spyOn(provider, 'deleteMany');
    const wrapper = pongoCacheWrapper({ provider });
    wrapper.deleteMany([
      `${dbName}:${collectionName}:a`,
      `${dbName}:${collectionName}:b`,
    ]);
    expect(spy).toHaveBeenCalledWith(['mydb:users:a', 'mydb:users:b']);
  });
});

describe('pongoCacheWrapper — error swallowing', () => {
  it('get returns undefined when provider throws', async () => {
    const provider = identityMapCache();
    vi.spyOn(provider, 'get').mockImplementation(() => {
      throw new Error('boom');
    });
    const wrapper = pongoCacheWrapper({ provider });
    expect(await wrapper.get(`${dbName}:${collectionName}:x`)).toBeUndefined();
  });

  it('set silently succeeds when provider throws', async () => {
    const provider = identityMapCache();
    vi.spyOn(provider, 'set').mockImplementation(() => {
      throw new Error('boom');
    });
    const wrapper = pongoCacheWrapper({ provider });
    await expect(
      wrapper.set(`${dbName}:${collectionName}:x`, { _id: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('delete silently succeeds when provider throws', async () => {
    const provider = identityMapCache();
    vi.spyOn(provider, 'delete').mockImplementation(() => {
      throw new Error('boom');
    });
    const wrapper = pongoCacheWrapper({ provider });
    await expect(
      wrapper.delete(`${dbName}:${collectionName}:x`),
    ).resolves.toBeUndefined();
  });

  it('getMany returns empty array when provider throws', async () => {
    const provider = identityMapCache();
    vi.spyOn(provider, 'getMany').mockImplementation(() => {
      throw new Error('boom');
    });
    const wrapper = pongoCacheWrapper({ provider });
    expect(
      await wrapper.getMany([
        `${dbName}:${collectionName}:a`,
        `${dbName}:${collectionName}:b`,
      ]),
    ).toEqual([]);
  });

  it('setMany silently succeeds when provider throws', async () => {
    const provider = identityMapCache();
    vi.spyOn(provider, 'setMany').mockImplementation(() => {
      throw new Error('boom');
    });
    const wrapper = pongoCacheWrapper({ provider });
    await expect(
      wrapper.setMany([
        { key: `${dbName}:${collectionName}:x`, value: { _id: 'x' } },
      ]),
    ).resolves.toBeUndefined();
  });

  it('deleteMany silently succeeds when provider throws', async () => {
    const provider = identityMapCache();
    vi.spyOn(provider, 'deleteMany').mockImplementation(() => {
      throw new Error('boom');
    });
    const wrapper = pongoCacheWrapper({ provider });
    await expect(
      wrapper.deleteMany([`${dbName}:${collectionName}:x`]),
    ).resolves.toBeUndefined();
  });
});

describe('pongoCacheWrapper — event hooks', () => {
  it('onHit called when get returns a value', async () => {
    const provider = identityMapCache();
    provider.set(`${dbName}:${collectionName}:x`, { _id: 'x' });
    const onHit = vi.fn();
    const wrapper = pongoCacheWrapper({ provider, hooks: { onHit } });
    await wrapper.get(`${dbName}:${collectionName}:x`);
    expect(onHit).toHaveBeenCalledWith(`${dbName}:${collectionName}:x`);
  });

  it('onMiss called when get returns undefined', async () => {
    const provider = identityMapCache();
    const onMiss = vi.fn();
    const wrapper = pongoCacheWrapper({ provider, hooks: { onMiss } });
    await wrapper.get(`${dbName}:${collectionName}:x`);
    expect(onMiss).toHaveBeenCalledWith(`${dbName}:${collectionName}:x`);
  });

  it('onEvict called on delete', async () => {
    const provider = identityMapCache();
    const onEvict = vi.fn();
    const wrapper = pongoCacheWrapper({ provider, hooks: { onEvict } });
    await wrapper.delete(`${dbName}:${collectionName}:x`);
    expect(onEvict).toHaveBeenCalledWith(`${dbName}:${collectionName}:x`);
  });

  it('onError called when provider throws, receives error and operation name', async () => {
    const provider = identityMapCache();
    const err = new Error('boom');
    vi.spyOn(provider, 'get').mockImplementation(() => {
      throw err;
    });
    const onError = vi.fn();
    const wrapper = pongoCacheWrapper({ provider, hooks: { onError } });
    await wrapper.get(`${dbName}:${collectionName}:x`);
    expect(onError).toHaveBeenCalledWith(err, 'get');
  });
});
