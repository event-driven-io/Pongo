import assert from 'node:assert';
import { describe, it } from 'node:test';
import { SQL } from '../../sql';
import { dumboSchema } from '../dumboSchema';
import type { TableRowType } from './tableTypesInference';

const { table, column } = dumboSchema;
const { Serial, Varchar, Integer, Timestamp, JSONB } = SQL.column.type;

void describe('Type Inference Runtime Tests', () => {
  void it('should compile successfully with basic table', () => {
    const _users = table('users', {
      columns: {
        id: column('id', Serial, { primaryKey: true }),
        email: column('email', Varchar(255), { notNull: true }),
        nickname: column('nickname', Varchar(100)),
      },
    });

    type UserRow = TableRowType<typeof _users>;

    const sampleUser: UserRow = {
      id: 1,
      email: 'test@example.com',
      nickname: 'tester',
    };

    assert.strictEqual(sampleUser.id, 1);
    assert.strictEqual(sampleUser.email, 'test@example.com');
    assert.strictEqual(sampleUser.nickname, 'tester');
  });

  void it('should allow null for nullable columns', () => {
    const _users2 = table('users', {
      columns: {
        id: column('id', Serial, { primaryKey: true }),
        nickname: column('nickname', Varchar(100)),
      },
    });

    type UserRow = TableRowType<typeof _users2>;

    const user1: UserRow = {
      id: 1,
      nickname: null,
    };

    const user2: UserRow = {
      id: 2,
      nickname: 'test',
    };

    assert.strictEqual(user1.nickname, null);
    assert.strictEqual(user2.nickname, 'test');
  });

  void it('should work with JSONB custom types', () => {
    const _products = table('products', {
      columns: {
        id: column('id', Serial, { primaryKey: true }),
        metadata: column('metadata', JSONB<{ tags: string[] }>()),
      },
    });

    type ProductRow = TableRowType<typeof _products>;

    const product: ProductRow = {
      id: 1,
      metadata: { tags: ['electronics', 'sale'] },
    };

    assert.strictEqual(product.id, 1);
    assert.deepStrictEqual(product.metadata, { tags: ['electronics', 'sale'] });
  });

  void it('should work with mixed nullable and non-nullable columns', () => {
    const _posts = table('posts', {
      columns: {
        id: column('id', Serial, { primaryKey: true }),
        title: column('title', Varchar(255), { notNull: true }),
        content: column('content', Varchar('max'), { notNull: true }),
        publishedAt: column('publishedAt', Timestamp),
        viewCount: column('viewCount', Integer),
      },
    });

    type PostRow = TableRowType<typeof _posts>;

    const draftPost: PostRow = {
      id: 1,
      title: 'My First Post',
      content: 'This is the content',
      publishedAt: null,
      viewCount: null,
    };

    const publishedPost: PostRow = {
      id: 2,
      title: 'Published Post',
      content: 'Published content',
      publishedAt: new Date(),
      viewCount: 42,
    };

    assert.strictEqual(draftPost.publishedAt, null);
    assert.strictEqual(draftPost.viewCount, null);
    assert.ok(publishedPost.publishedAt instanceof Date);
    assert.strictEqual(publishedPost.viewCount, 42);
  });

  void it('should work with default values (still nullable)', () => {
    const _events = table('events', {
      columns: {
        id: column('id', Serial, { primaryKey: true }),
        createdAt: column('createdAt', Timestamp, {
          default: SQL.plain(`NOW()`),
        }),
      },
    });

    type EventRow = TableRowType<typeof _events>;

    const event1: EventRow = {
      id: 1,
      createdAt: new Date(),
    };

    const event2: EventRow = {
      id: 2,
      createdAt: null,
    };

    assert.ok(event1.createdAt instanceof Date);
    assert.strictEqual(event2.createdAt, null);
  });

  void it('example: type-safe query result processing', () => {
    const _users3 = table('users', {
      columns: {
        id: column('id', Serial, { primaryKey: true }),
        email: column('email', Varchar(255), { notNull: true }),
        nickname: column('nickname', Varchar(100)),
        age: column('age', Integer),
      },
    });

    type UserRow = TableRowType<typeof _users3>;

    const mockQueryResults: UserRow[] = [
      { id: 1, email: 'alice@example.com', nickname: 'alice', age: 30 },
      { id: 2, email: 'bob@example.com', nickname: null, age: null },
      { id: 3, email: 'charlie@example.com', nickname: 'charlie', age: 25 },
    ];

    const processedResults = mockQueryResults.map((user) => ({
      id: user.id,
      email: user.email.toUpperCase(),
      displayName: user.nickname ?? 'Anonymous',
      isAdult: user.age !== null && user.age >= 18,
    }));

    assert.strictEqual(processedResults[0]?.email, 'ALICE@EXAMPLE.COM');
    assert.strictEqual(processedResults[1]?.displayName, 'Anonymous');
    assert.strictEqual(processedResults[2]?.isAdult, true);
  });
});
