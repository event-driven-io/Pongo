import assert from 'assert';
import fs from 'fs';
import { afterEach, describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { count, JSONSerializer, SQL } from '../../../../core';
import {
  sqlite3Client,
  sqlite3Connection,
  sqlite3Pool,
} from '../../../../sqlite3';
import {
  InMemorySQLiteDatabase,
  type SQLiteClientOrPoolClient,
} from '../../core';

const withDeadline = { timeout: 30000 };

void describe('Node SQLite3 pool', () => {
  const inMemoryfileName: string = InMemorySQLiteDatabase;

  const testDatabasePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  const fileName = path.resolve(testDatabasePath, 'test.db');

  const testCases = [
    { testName: 'in-memory', fileName: inMemoryfileName },
    { testName: 'file', fileName: fileName },
  ];

  afterEach(() => {
    if (!fs.existsSync(fileName)) {
      return;
    }
    try {
      fs.unlinkSync(fileName);
      fs.unlinkSync(`${fileName}-shm`);
      fs.unlinkSync(`${fileName}-wal`);
    } catch (error) {
      console.log('Error deleting file:', error);
    }
  });

  void describe(`in-memory database`, () => {
    void it('returns the singleton connection', withDeadline, async () => {
      const pool = sqlite3Pool({
        fileName: inMemoryfileName,
      });
      const connection = await pool.connection();
      const otherConnection = await pool.connection();

      try {
        const client = await connection.open();
        const otherClient = await otherConnection.open();
        assert.strictEqual(client, otherClient);
      } finally {
        await connection.close();
        await otherConnection.close();
        await pool.close();
      }
    });
  });

  void describe(`file-based database`, () => {
    void it(
      'returns the same connection from writer sub-pool',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({
          fileName,
        });
        const connection = await pool.connection();
        const otherConnection = await pool.connection();

        try {
          const client = await connection.open();
          const otherClient = await otherConnection.open();
          assert.deepStrictEqual(client, otherClient);
        } finally {
          await connection.close();
          await otherConnection.close();
          await pool.close();
        }
      },
    );

    void it(
      'returns the new connection for readonly option and no options',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({
          fileName,
        });
        const connection = await pool.connection();
        const readonlyConnection = await pool.connection({ readonly: true });

        try {
          assert.notDeepStrictEqual(connection, readonlyConnection);

          const client = await connection.open();
          const otherClient = await readonlyConnection.open();
          assert.notDeepStrictEqual(client, otherClient);
        } finally {
          await connection.close();
          await readonlyConnection.close();
          await pool.close();
        }
      },
    );

    void it(
      'returns the new connection for readonly option and not readonly',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({
          fileName,
        });
        const connection = await pool.connection({ readonly: false });
        const readonlyConnection = await pool.connection({ readonly: true });

        try {
          assert.notDeepStrictEqual(connection, readonlyConnection);

          const client = await connection.open();
          const otherClient = await readonlyConnection.open();
          assert.notDeepStrictEqual(client, otherClient);
        } finally {
          await connection.close();
          await readonlyConnection.close();
          await pool.close();
        }
      },
    );

    void it(
      'for singleton setting returns the singleton connection',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({
          fileName,
          singleton: true,
        });
        const connection = await pool.connection();
        const otherConnection = await pool.connection();

        try {
          const client = await connection.open();
          const otherClient = await otherConnection.open();
          assert.strictEqual(client, otherClient);
        } finally {
          await connection.close();
          await otherConnection.close();
          await pool.close();
        }
      },
    );
  });

  for (const { testName, fileName } of testCases) {
    void describe(`sqlite3Pool with ${testName} database`, () => {
      void it('connects using default pool', withDeadline, async () => {
        const pool = sqlite3Pool({
          fileName,
        });
        const connection = await pool.connection();

        try {
          await connection.execute.query(SQL`SELECT 1`);
        } catch (error) {
          console.log(error);
          assert.fail();
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      void it('connects using client', withDeadline, async () => {
        const pool = sqlite3Pool({
          fileName,
          pooled: false,
        });
        const connection = await pool.connection();

        try {
          await connection.execute.query(SQL`SELECT 1`);
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      void it(
        `connects using ambient client ${testName}`,
        withDeadline,
        async () => {
          const existingClient = sqlite3Client({
            fileName,
            serializer: JSONSerializer,
          });
          await existingClient.connect();

          const pool = sqlite3Pool({
            client: existingClient,
          });
          const connection = await pool.connection();

          try {
            await connection.execute.query(SQL`SELECT 1`);
          } finally {
            await connection.close();
            await pool.close();
            await existingClient.close();
          }
        },
      );

      void it(
        'connects using connected ambient connected connection from pool',
        withDeadline,
        async () => {
          const ambientPool = sqlite3Pool({
            fileName,
          });
          const ambientConnection = await ambientPool.connection();
          await ambientConnection.open();

          const pool = sqlite3Pool({
            fileName,
            connection: ambientConnection,
          });

          try {
            await pool.execute.query(SQL`SELECT 1`);
          } finally {
            await pool.close();
            await ambientConnection.close();
            await ambientPool.close();
          }
        },
      );

      void it(
        'connects using connected ambient connected connection',
        withDeadline,
        async () => {
          const ambientConnection = sqlite3Connection({
            fileName,
            serializer: JSONSerializer,
          });
          await ambientConnection.open();

          try {
            const pool = sqlite3Pool({
              fileName,
              connection: ambientConnection,
            });

            try {
              await pool.execute.query(SQL`SELECT 1`);
            } finally {
              await pool.close();
            }

            await ambientConnection.execute.query(SQL`SELECT 1`);
          } finally {
            await ambientConnection.close();
          }
        },
      );

      void it(
        'connects using connected ambient connected connection and using transaction on pool',
        withDeadline,
        async () => {
          const ambientConnection = sqlite3Connection({
            fileName,
            serializer: JSONSerializer,
          });
          await ambientConnection.open();

          try {
            const pool = sqlite3Pool({
              fileName,
              connection: ambientConnection,
              transactionOptions: { allowNestedTransactions: true },
            });

            try {
              await pool.withTransaction(async (tx) => {
                await tx.execute.query(SQL`SELECT 1`);
              });
            } finally {
              await pool.close();
            }

            await ambientConnection.withTransaction(async (tx) => {
              await tx.execute.query(SQL`SELECT 1`);
            });
          } finally {
            await ambientConnection.close();
          }
        },
      );

      void it(
        'withConnection on ambient pool does not close the ambient connection',
        withDeadline,
        async () => {
          const ambientConnection = sqlite3Connection({
            fileName,
            serializer: JSONSerializer,
          });
          await ambientConnection.open();

          try {
            const pool = sqlite3Pool({
              fileName,
              connection: ambientConnection,
            });

            await pool.withConnection(async (conn) => {
              await conn.execute.query(SQL`SELECT 1`);
            });

            await pool.close();

            await ambientConnection.execute.query(SQL`SELECT 1`);
          } finally {
            await ambientConnection.close();
          }
        },
      );

      void it(
        'connects using connected ambient not-connected connection',
        withDeadline,
        async () => {
          const ambientPool = sqlite3Pool({
            fileName,
          });
          const ambientConnection = await ambientPool.connection();

          const pool = sqlite3Pool({
            fileName,
            connection: ambientConnection,
          });

          try {
            await pool.execute.query(SQL`SELECT 1`);
          } finally {
            await pool.close();
            await ambientConnection.close();
            await ambientPool.close();
          }
        },
      );

      void it(
        'connects using ambient connected connection with transaction',
        withDeadline,
        async () => {
          const ambientPool = sqlite3Pool({
            fileName,
          });
          const ambientConnection = await ambientPool.connection();
          await ambientConnection.open();

          try {
            await ambientConnection.withTransaction<void>(async () => {
              const pool = sqlite3Pool({
                fileName,
                connection: ambientConnection,
              });
              try {
                await pool.execute.query(SQL`SELECT 1`);

                return { success: true, result: undefined };
              } finally {
                await pool.close();
              }
            });
          } finally {
            await ambientConnection.close();
            await ambientPool.close();
          }
        },
      );

      void it(
        'connects using ambient not-connected connection with transaction',
        withDeadline,
        async () => {
          const ambientPool = sqlite3Pool({
            fileName,
          });
          const ambientConnection = await ambientPool.connection();

          try {
            await ambientConnection.withTransaction<void>(async () => {
              const pool = sqlite3Pool({
                fileName,
                connection: ambientConnection,
              });
              try {
                await pool.execute.query(SQL`SELECT 1`);

                return { success: true, result: undefined };
              } finally {
                await pool.close();
              }
            });
          } finally {
            await ambientConnection.close();
            await ambientPool.close();
          }
        },
      );

      void it(
        'connects using ambient connection in withConnection scope',
        withDeadline,
        async () => {
          const ambientPool = sqlite3Pool({
            fileName,
          });
          try {
            await ambientPool.withConnection(async (ambientConnection) => {
              const pool = sqlite3Pool({
                fileName,
                connection: ambientConnection,
              });
              try {
                await pool.execute.query(SQL`SELECT 1`);

                return { success: true, result: undefined };
              } finally {
                await pool.close();
              }
            });
          } finally {
            await ambientPool.close();
          }
        },
      );

      void it(
        'connects using ambient connection in withConnection and withTransaction scope',
        withDeadline,
        async () => {
          const ambientPool = sqlite3Pool({
            fileName,
          });
          try {
            await ambientPool.withConnection((ambientConnection) =>
              ambientConnection.withTransaction<void>(async () => {
                const pool = sqlite3Pool({
                  fileName,
                  connection: ambientConnection,
                });
                try {
                  await pool.execute.query(SQL`SELECT 1`);
                } finally {
                  await pool.close();
                }
              }),
            );
          } finally {
            await ambientPool.close();
          }
        },
      );
    });
  }

  void describe('dual pool concurrency (file-based)', () => {
    void it(
      'handles concurrent writes and consumers without SQLITE_BUSY',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({ fileName });

        // Step 1: Setup table before concurrency
        {
          const conn = await pool.connection();
          try {
            await conn.execute.command(SQL`
              CREATE TABLE IF NOT EXISTS test_concurrent (
                id INTEGER PRIMARY KEY,
                value INTEGER
              )
            `);
          } finally {
            await conn.close();
          }
        }

        let running = true;
        const consumer = async () => {
          while (running) {
            try {
              const conn = await pool.connection();
              await conn.execute.query(
                SQL`SELECT COUNT(*) FROM test_concurrent`,
              );
              await conn.close();
            } catch {
              // Ignore errors for this test
            }
            await new Promise((r) => setTimeout(r, 10));
          }
        };

        const consumer1 = consumer();
        const consumer2 = consumer();

        // Step 3: Perform concurrent writes
        const writePromises = [];
        const errors: string[] = [];
        for (let i = 0; i < 10; i++) {
          writePromises.push(
            (async () => {
              const conn = await pool.connection();
              try {
                await conn.execute.command(
                  SQL`INSERT INTO test_concurrent (value) VALUES (${i})`,
                );
              } catch (err) {
                errors.push((err as Error).message);
              } finally {
                await conn.close();
              }
            })(),
          );
        }

        await Promise.all(writePromises);

        // Step 4: Stop consumers
        running = false;
        await Promise.all([consumer1, consumer2]);

        await pool.close();

        assert.strictEqual(
          errors.length,
          0,
          `Errors occurred: ${errors.join(', ')}`,
        );
      },
    );

    void it(
      'handles concurrent readonly reads without blocking',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({ fileName });

        const conn = await pool.connection();
        try {
          await conn.execute.command(SQL`
          CREATE TABLE IF NOT EXISTS test_reads (
            id INTEGER PRIMARY KEY,
            value INTEGER
          )
        `);
          await conn.execute.command(
            SQL`INSERT INTO test_reads (value) VALUES (42)`,
          );
        } finally {
          await conn.close();
        }

        const errors: string[] = [];
        const readPromises = Array.from({ length: 8 }, (_, i) =>
          (async () => {
            try {
              const conn = await pool.connection({ readonly: true });
              try {
                await conn.execute.query(
                  SQL`SELECT * FROM test_reads WHERE value = ${42}`,
                );
              } finally {
                await conn.close();
              }
            } catch (err) {
              errors.push(`reader ${i}: ${(err as Error).message}`);
            }
          })(),
        );

        await Promise.all(readPromises);
        await pool.close();

        assert.strictEqual(
          errors.length,
          0,
          `Read errors: ${errors.join(', ')}`,
        );
      },
    );

    void it(
      'handles concurrent reads and writes through separate pools',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({ fileName });

        try {
          await pool.execute.command(SQL`
        CREATE TABLE IF NOT EXISTS test_dual (
          id INTEGER PRIMARY KEY,
          value INTEGER
        )
      `);

          const errors: string[] = [];

          const writePromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                const conn = await pool.connection();
                try {
                  await conn.execute.command(
                    SQL`INSERT INTO test_dual (value) VALUES (${i})`,
                  );
                } finally {
                  await conn.close();
                }
              } catch (err) {
                errors.push(`writer ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          const readPromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                const conn = await pool.connection({ readonly: true });
                try {
                  await conn.execute.query(
                    SQL`SELECT COUNT(*) as count FROM test_dual`,
                  );
                } finally {
                  await conn.close();
                }
              } catch (err) {
                errors.push(`reader ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          await Promise.all([...writePromises, ...readPromises]);

          assert.strictEqual(errors.length, 0, `Errors: ${errors.join(', ')}`);
        } finally {
          await pool.close();
        }
      },
    );

    void it(
      'handles concurrent writes with connection.transaction() and reads',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });

        try {
          await pool.execute.command(SQL`
          CREATE TABLE IF NOT EXISTS test_conn_tx (
            id INTEGER PRIMARY KEY,
            value INTEGER
          )
        `);

          const errors: string[] = [];

          const writePromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                const conn = await pool.connection();
                try {
                  const tx = conn.transaction();
                  await tx.begin();
                  await tx.execute.command(
                    SQL`INSERT INTO test_conn_tx (value) VALUES (${i})`,
                  );
                  await tx.commit();
                } finally {
                  await conn.close();
                }
              } catch (err) {
                errors.push(`writer ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          const readPromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                const conn = await pool.connection({ readonly: true });
                try {
                  await conn.execute.query(
                    SQL`SELECT COUNT(*) as count FROM test_conn_tx`,
                  );
                } finally {
                  await conn.close();
                }
              } catch (err) {
                errors.push(`reader ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          await Promise.all([...writePromises, ...readPromises]);
          assert.strictEqual(errors.length, 0, `Errors: ${errors.join(', ')}`);

          const result = await count(
            pool.execute.query(SQL`SELECT COUNT(*) as count FROM test_conn_tx`),
          );
          assert.strictEqual(result, 10);
        } finally {
          await pool.close();
        }
      },
    );

    void it(
      'handles concurrent writes with connection.withTransaction() and reads',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });

        try {
          await pool.execute.command(SQL`
          CREATE TABLE IF NOT EXISTS test_conn_with_tx (
            id INTEGER PRIMARY KEY,
            value INTEGER
          )
        `);

          const errors: string[] = [];

          const writePromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                const conn = await pool.connection();
                try {
                  await conn.withTransaction(async () => {
                    await conn.execute.command(
                      SQL`INSERT INTO test_conn_with_tx (value) VALUES (${i})`,
                    );
                  });
                } finally {
                  await conn.close();
                }
              } catch (err) {
                errors.push(`writer ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          const readPromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                const conn = await pool.connection({ readonly: true });
                try {
                  await conn.execute.query(
                    SQL`SELECT COUNT(*) as count FROM test_conn_with_tx`,
                  );
                } finally {
                  await conn.close();
                }
              } catch (err) {
                errors.push(`reader ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          await Promise.all([...writePromises, ...readPromises]);

          assert.strictEqual(errors.length, 0, `Errors: ${errors.join(', ')}`);

          const result = await count(
            pool.execute.query(
              SQL`SELECT COUNT(*) as count FROM test_conn_with_tx`,
            ),
          );
          assert.strictEqual(result, 10);
        } finally {
          await pool.close();
        }
      },
    );

    void it(
      'handles concurrent writes with pool.transaction() and reads',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });

        try {
          await pool.execute.command(SQL`
          CREATE TABLE IF NOT EXISTS test_pool_tx (
            id INTEGER PRIMARY KEY,
            value INTEGER
          )
        `);

          const errors: string[] = [];

          const writePromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                const tx = pool.transaction();
                await tx.begin();
                await tx.execute.command(
                  SQL`INSERT INTO test_pool_tx (value) VALUES (${i})`,
                );
                await tx.commit();
              } catch (err) {
                errors.push(`writer ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          const readPromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                const conn = await pool.connection({ readonly: true });
                try {
                  await conn.execute.query(
                    SQL`SELECT COUNT(*) as count FROM test_pool_tx`,
                  );
                } finally {
                  await conn.close();
                }
              } catch (err) {
                errors.push(`reader ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          await Promise.all([...writePromises, ...readPromises]);
          assert.strictEqual(errors.length, 0, `Errors: ${errors.join(', ')}`);

          const result = await count(
            pool.execute.query(SQL`SELECT COUNT(*) as count FROM test_pool_tx`),
          );
          assert.strictEqual(result, 10);
        } finally {
          await pool.close();
        }
      },
    );

    void it(
      'handles concurrent writes with pool.withTransaction() and reads',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({
          fileName,
          transactionOptions: { allowNestedTransactions: true },
        });

        try {
          await pool.execute.command(SQL`
          CREATE TABLE IF NOT EXISTS test_pool_with_tx (
            id INTEGER PRIMARY KEY,
            value INTEGER
          )
        `);

          const errors: string[] = [];

          const writePromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                await pool.withTransaction(async (tx) => {
                  await tx.execute.command(
                    SQL`INSERT INTO test_pool_with_tx (value) VALUES (${i})`,
                  );
                });
              } catch (err) {
                errors.push(`writer ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          const readPromises = Array.from({ length: 10 }, (_, i) =>
            (async () => {
              try {
                const conn = await pool.connection({ readonly: true });
                try {
                  await conn.execute.query(
                    SQL`SELECT COUNT(*) as count FROM test_pool_with_tx`,
                  );
                } finally {
                  await conn.close();
                }
              } catch (err) {
                errors.push(`reader ${i}: ${(err as Error).message}`);
              }
            })(),
          );

          await Promise.all([...writePromises, ...readPromises]);
          assert.strictEqual(errors.length, 0, `Errors: ${errors.join(', ')}`);

          const result = await count(
            pool.execute.query(
              SQL`SELECT COUNT(*) as count FROM test_pool_with_tx`,
            ),
          );
          assert.strictEqual(result, 10);
        } finally {
          await pool.close();
        }
      },
    );

    void it(
      'reuses reader pool connections after close',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({ fileName });

        try {
          await pool.execute.command(SQL`
          CREATE TABLE IF NOT EXISTS test_reuse (
            id INTEGER PRIMARY KEY,
            value INTEGER
          )
        `);

          let firstClient: SQLiteClientOrPoolClient;
          let secondClient: SQLiteClientOrPoolClient;

          const firstConn = await pool.connection({ readonly: true });
          try {
            firstClient = await firstConn.open();
            await firstConn.execute.query(
              SQL`SELECT 1 FROM test_reuse limit 1`,
            );
          } finally {
            await firstConn.close();
          }

          const secondConn = await pool.connection({ readonly: true });
          try {
            secondClient = await secondConn.open();
            await firstConn.execute.query(
              SQL`SELECT 1 FROM test_reuse limit 1`,
            );
          } finally {
            await secondConn.close();
          }

          assert.strictEqual(
            firstClient,
            secondClient,
            'Reader pool should reuse connections instead of creating new ones',
          );
        } finally {
          await pool.close();
        }
      },
    );

    void it(
      'handles parallel connection opens without SQLITE_BUSY',
      withDeadline,
      async () => {
        const pool = sqlite3Pool({ fileName });

        const errors: string[] = [];
        const connectionCount = 100;

        const connectionPromises = Array.from(
          { length: connectionCount },
          (_, i) =>
            (async () => {
              try {
                const conn = await pool.connection({ readonly: i % 2 === 0 });
                try {
                  await conn.execute.query(SQL`SELECT 1`);
                } finally {
                  await conn.close();
                }
              } catch (err) {
                errors.push(`connection ${i}: ${(err as Error).message}`);
              }
            })(),
        );

        await Promise.all(connectionPromises);
        await pool.close();

        assert.strictEqual(
          errors.length,
          0,
          `SQLITE_BUSY or other errors occurred: ${errors.join(', ')}`,
        );
      },
    );
  });
});
