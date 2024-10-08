import assert from 'assert';
import chalk from 'chalk';
import { describe, it } from 'node:test';
import { prettyPrintJson } from './pretty';

// Define a basic test suite
void describe('prettyPrintJson', () => {
  // Turn off chalk colorization during tests for easy comparison
  chalk.level = 0;

  void it('formats a simple object correctly without multiline strings', () => {
    const input = {
      name: 'John Doe',
      age: 30,
    };

    const expectedOutput = `{
  "name": "John Doe",
  "age": 30
}`;

    const output = prettyPrintJson(input, false); // Multiline handling off
    assert.strictEqual(output, expectedOutput);
  });

  void it('formats a simple object with multiline string handling', () => {
    const input = {
      name: 'John Doe',
      bio: 'This is line one.\nThis is line two.',
    };

    const expectedOutput = `{
  "name": "John Doe",
  "bio": "
    This is line one.
    This is line two.
  "
}`;

    const output = prettyPrintJson(input, true); // Multiline handling on
    assert.strictEqual(output, expectedOutput);
  });

  void it('formats nested objects correctly', () => {
    const input = {
      user: {
        name: 'Alice',
        age: 25,
        location: {
          city: 'Wonderland',
          country: 'Fiction',
        },
      },
    };

    const expectedOutput = `{
  "user": {
    "name": "Alice",
    "age": 25,
    "location": {
      "city": "Wonderland",
      "country": "Fiction"
    }
  }
}`;

    const output = prettyPrintJson(input, false); // Multiline handling off
    assert.strictEqual(output, expectedOutput);
  });

  void it('handles arrays and numbers correctly', () => {
    const input = {
      numbers: [1, 2, 3, 4, 5],
      active: true,
    };

    const expectedOutput = `{
  "numbers": [
    1,
    2,
    3,
    4,
    5
  ],
  "active": true
}`;

    const output = prettyPrintJson(input, false); // Multiline handling off
    assert.strictEqual(output, expectedOutput);
  });

  void it('formats an object with null values and booleans correctly', () => {
    const input = {
      name: 'Test',
      isActive: false,
      tags: null,
    };

    const expectedOutput = `{
  "name": "Test",
  "isActive": false,
  "tags": null
}`;

    const output = prettyPrintJson(input, false); // Multiline handling off
    assert.strictEqual(output, expectedOutput);
  });

  void it('handles multiline SQL-like queries in strings', () => {
    const input = {
      query:
        'CREATE TABLE users (\n  id INT PRIMARY KEY,\n  name TEXT NOT NULL\n)',
    };

    const expectedOutput = `{
  "query": "
    CREATE TABLE users (
      id INT PRIMARY KEY,
      name TEXT NOT NULL
    )
  "
}`;

    const output = prettyPrintJson(input, true); // Multiline handling on
    console.log(output);
    assert.strictEqual(output, expectedOutput);
  });
});
