import { SQL } from '@event-driven-io/dumbo';
import { pgFormatter } from '@event-driven-io/dumbo/pg';
import assert from 'assert';
import { describe, it } from 'node:test';
import { postgresSQLBuilder } from '.';

void describe('find() query options', () => {
  // void it('should apply limit correctly', () => {
  //   const query = postgresSQLBuilder('users').find({}, { limit: 4 });
  //   assert.strictEqual(
  //     SQL.format(query, pgFormatter),
  //     `SELECT data FROM users LIMIT 4 ;`,
  //   );
  // });

  void it('should apply offset correctly', () => {
    const query = postgresSQLBuilder('users').find({}, { skip: 123 });
    assert.strictEqual(
      SQL.format(query, pgFormatter),
      `SELECT data FROM users OFFSET 123 ;`,
    );
  });

  // void it('should apply limit and offset in correct order', () => {
  //   const query = postgresSQLBuilder('users').find(
  //     {},
  //     { limit: 20, skip: 123 },
  //   );
  //   assert.strictEqual(
  //     SQL.format(query, pgFormatter),
  //     `SELECT data FROM users LIMIT 20 OFFSET 123 ;`,
  //   );
  // });
});
