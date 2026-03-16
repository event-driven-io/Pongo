import { describe, expect, it, vi } from 'vitest';
import { pongoCacheWrapper } from './cacheWrapper';
import type { PongoCacheProvider } from './types';

import type { PongoDocument } from '../typing';

const makeProvider = (): PongoCacheProvider & {
  store: Map<string, PongoDocument>;
} => {
  const store = new Map<string, PongoDocument>();
  return {
    store,
    get: (key) => store.get(key) ?? undefined,
    set: (key, value) => { store.set(key, value); },
    delete: (key) => { store.delete(key); },
    getMany: (keys) => keys.map((k) => store.get(k)),
    setMany: (entries) => { for (const { key, value } of entries) store.set(key, value); },
    deleteMany: (keys) => { for (const key of keys) store.delete(key); },
    clear: () => { store.clear(); },
  };
};

describe('pongoCacheWrapper — key prefixing', () => {
  it('get prefixes key', () => {
    const provider = makeProvider();
    const spy = vi.spyOn(provider, 'get');
    const wrapper = pongoCacheWrapper({ provider, dbName: 'mydb', collectionName: 'users' });
    wrapper.get('doc1');
    expect(spy).toHaveBeenCalledWith('mydb:users:doc1');
  });

  it('set prefixes key', () => {
    const provider = makeProvider();
    const spy = vi.spyOn(provider, 'set');
    const wrapper = pongoCacheWrapper({ provider, dbName: 'mydb', collectionName: 'users' });
    wrapper.set('doc1', { _id: 'doc1' });
    expect(spy).toHaveBeenCalledWith('mydb:users:doc1', { _id: 'doc1' }, undefined);
  });

  it('delete prefixes key', () => {
    const provider = makeProvider();
    const spy = vi.spyOn(provider, 'delete');
    const wrapper = pongoCacheWrapper({ provider, dbName: 'mydb', collectionName: 'users' });
    wrapper.delete('doc1');
    expect(spy).toHaveBeenCalledWith('mydb:users:doc1');
  });

  it('getMany prefixes all keys', () => {
    const provider = makeProvider();
    const spy = vi.spyOn(provider, 'getMany');
    const wrapper = pongoCacheWrapper({ provider, dbName: 'mydb', collectionName: 'users' });
    wrapper.getMany(['a', 'b']);
    expect(spy).toHaveBeenCalledWith(['mydb:users:a', 'mydb:users:b']);
  });

  it('setMany prefixes all keys', () => {
    const provider = makeProvider();
    const spy = vi.spyOn(provider, 'setMany');
    const wrapper = pongoCacheWrapper({ provider, dbName: 'mydb', collectionName: 'users' });
    wrapper.setMany([{ key: 'a', value: { _id: 'a' } }]);
    expect(spy).toHaveBeenCalledWith([{ key: 'mydb:users:a', value: { _id: 'a' }, ttl: undefined }]);
  });

  it('deleteMany prefixes all keys', () => {
    const provider = makeProvider();
    const spy = vi.spyOn(provider, 'deleteMany');
    const wrapper = pongoCacheWrapper({ provider, dbName: 'mydb', collectionName: 'users' });
    wrapper.deleteMany(['a', 'b']);
    expect(spy).toHaveBeenCalledWith(['mydb:users:a', 'mydb:users:b']);
  });
});

describe('pongoCacheWrapper — error swallowing', () => {
  it('get returns undefined when provider throws', async () => {
    const provider = makeProvider();
    vi.spyOn(provider, 'get').mockImplementation(() => { throw new Error('boom'); });
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c' });
    expect(await wrapper.get('x')).toBeUndefined();
  });

  it('set silently succeeds when provider throws', async () => {
    const provider = makeProvider();
    vi.spyOn(provider, 'set').mockImplementation(() => { throw new Error('boom'); });
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c' });
    await expect(wrapper.set('x', { _id: 'x' })).resolves.toBeUndefined();
  });

  it('delete silently succeeds when provider throws', async () => {
    const provider = makeProvider();
    vi.spyOn(provider, 'delete').mockImplementation(() => { throw new Error('boom'); });
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c' });
    await expect(wrapper.delete('x')).resolves.toBeUndefined();
  });

  it('getMany returns empty array when provider throws', async () => {
    const provider = makeProvider();
    vi.spyOn(provider, 'getMany').mockImplementation(() => { throw new Error('boom'); });
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c' });
    expect(await wrapper.getMany(['a', 'b'])).toEqual([undefined, undefined]);
  });

  it('setMany silently succeeds when provider throws', async () => {
    const provider = makeProvider();
    vi.spyOn(provider, 'setMany').mockImplementation(() => { throw new Error('boom'); });
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c' });
    await expect(wrapper.setMany([{ key: 'x', value: { _id: 'x' } }])).resolves.toBeUndefined();
  });

  it('deleteMany silently succeeds when provider throws', async () => {
    const provider = makeProvider();
    vi.spyOn(provider, 'deleteMany').mockImplementation(() => { throw new Error('boom'); });
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c' });
    await expect(wrapper.deleteMany(['x'])).resolves.toBeUndefined();
  });
});

describe('pongoCacheWrapper — event hooks', () => {
  it('onHit called when get returns a value', async () => {
    const provider = makeProvider();
    provider.store.set('d:c:x', { _id: 'x' });
    const onHit = vi.fn();
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c', hooks: { onHit } });
    await wrapper.get('x');
    expect(onHit).toHaveBeenCalledWith('x');
  });

  it('onMiss called when get returns null/undefined', async () => {
    const provider = makeProvider();
    const onMiss = vi.fn();
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c', hooks: { onMiss } });
    await wrapper.get('x');
    expect(onMiss).toHaveBeenCalledWith('x');
  });

  it('onEvict called on delete', async () => {
    const provider = makeProvider();
    const onEvict = vi.fn();
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c', hooks: { onEvict } });
    await wrapper.delete('x');
    expect(onEvict).toHaveBeenCalledWith('x');
  });

  it('onError called when provider throws, receives error and operation name', async () => {
    const provider = makeProvider();
    const err = new Error('boom');
    vi.spyOn(provider, 'get').mockImplementation(() => { throw err; });
    const onError = vi.fn();
    const wrapper = pongoCacheWrapper({ provider, dbName: 'd', collectionName: 'c', hooks: { onError } });
    await wrapper.get('x');
    expect(onError).toHaveBeenCalledWith(err, 'get');
  });
});
