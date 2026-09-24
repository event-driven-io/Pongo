import { DumboError } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { AnyPongoDriver, PongoSession } from '../core';
import { MongoClient } from './mongoClient';

const testMongoClient = () =>
  new MongoClient({
    driver: { driverType: 'Test:fake' } as unknown as AnyPongoDriver,
  });

describe('MongoClient', () => {
  it('rejects a connection string without a registered Pongo driver', () => {
    assert.throws(
      () => new MongoClient('postgresql://localhost:5432/postgres'),
      (error: unknown) => {
        assert.ok(DumboError.isInstanceOf(error));
        assert.strictEqual(error.errorType, 'PongoError');
        assert.strictEqual(error.errorCode, 500);
        assert.match(error.message, /No database driver registered for/);
        return true;
      },
    );
  });

  it('startSession passes defaultTransactionOptions to the session', () => {
    const session = testMongoClient().startSession({
      defaultTransactionOptions: { maxCommitTimeMS: 50 },
    });

    assert.strictEqual(session.defaultTransactionOptions.maxCommitTimeMS, 50);
  });

  it('withSession passes defaultTransactionOptions to the session', async () => {
    const maxCommitTimeMS = await testMongoClient().withSession(
      { defaultTransactionOptions: { maxCommitTimeMS: 50 } },
      (session) =>
        Promise.resolve(session.defaultTransactionOptions.maxCommitTimeMS),
    );

    assert.strictEqual(maxCommitTimeMS, 50);
  });

  it('startSession passes defaultTimeoutMS to the session', () => {
    const session = testMongoClient().startSession({ defaultTimeoutMS: 50 });

    assert.strictEqual(
      (session as unknown as PongoSession).defaultTimeoutMS,
      50,
    );
  });

  it('withSession passes defaultTimeoutMS to the session', async () => {
    const defaultTimeoutMS = await testMongoClient().withSession(
      { defaultTimeoutMS: 50 },
      (session) =>
        Promise.resolve((session as unknown as PongoSession).defaultTimeoutMS),
    );

    assert.strictEqual(defaultTimeoutMS, 50);
  });
});
