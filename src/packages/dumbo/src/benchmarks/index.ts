import 'dotenv/config';

import { bench, group, run, summary } from 'mitata';
import pg from 'pg';
import { dumbo, single, SQL } from '..';
import {
  defaultPostgreSQLConnectionString,
  pgDumboDriver,
  PostgreSQLConnectionString,
} from '../pg';

const connectionString = PostgreSQLConnectionString(
  process.env.BENCHMARK_POSTGRESQL_CONNECTION_STRING ??
    defaultPostgreSQLConnectionString,
);

console.log(`Using PostgreSQL connection string: ${connectionString}`);

const pooled = process.env.BENCHMARK_CONNECTION_POOLED === 'true';

const pool = dumbo({
  connectionString,
  driver: pgDumboDriver,
  pooled,
});

const rawPgPool = new pg.Pool({ connectionString });

const setup = async () => {
  await pool.execute.command(
    SQL`
      CREATE TABLE IF NOT EXISTS cars (
        id SERIAL PRIMARY KEY,
        brand VARCHAR(255)
      );`,
  );
  await pool.execute.command(
    SQL`CREATE TABLE IF NOT EXISTS bench_streams (
      stream_id TEXT PRIMARY KEY,
      stream_position INTEGER NOT NULL DEFAULT 0
    )`,
  );
  await pool.execute.command(SQL`TRUNCATE TABLE bench_streams;`);
  await pool.execute.command(
    SQL`CREATE TABLE IF NOT EXISTS bench_messages (
      id BIGSERIAL PRIMARY KEY,
      stream_id TEXT NOT NULL,
      stream_position INTEGER NOT NULL,
      data TEXT NOT NULL
    )`,
  );
  await pool.execute.command(SQL`TRUNCATE TABLE bench_messages;`);
};

const appendWithTransaction = async (streamId: string, data: string) =>
  pool.withTransaction(async (tx) => {
    const streamResult = await tx.execute.command<{
      stream_position: number;
    }>(
      SQL`INSERT INTO bench_streams (stream_id, stream_position)
        VALUES (${streamId}, 1)
        ON CONFLICT (stream_id) DO UPDATE
          SET stream_position = bench_streams.stream_position + 1
        RETURNING stream_position`,
    );

    const position = streamResult.rows[0]!.stream_position;

    await tx.execute.command<{ id: number }>(
      SQL`INSERT INTO bench_messages (stream_id, stream_position, data)
        VALUES (${streamId}, ${position}, ${data})
        RETURNING id`,
    );
  });

const appendRaw = async (streamId: string, data: string) => {
  const streamResult = await pool.execute.command<{
    stream_position: number;
  }>(
    SQL`INSERT INTO bench_streams (stream_id, stream_position)
      VALUES (${streamId}, 1)
      ON CONFLICT (stream_id) DO UPDATE
        SET stream_position = bench_streams.stream_position + 1
      RETURNING stream_position`,
  );

  const position = streamResult.rows[0]!.stream_position;

  await pool.execute.command<{ id: number }>(
    SQL`INSERT INTO bench_messages (stream_id, stream_position, data)
      VALUES (${streamId}, ${position}, ${data})
      RETURNING id`,
  );
};

await setup();

// Pre-create streams for the "existing stream" benchmarks
await appendWithTransaction('warm-stream', '{"type":"warmup"}');
await appendRaw('warm-stream-raw', '{"type":"warmup"}');

let txCounter = 0;
let rawCounter = 0;

summary(() => {
  bench('open and close raw connection', async () => {
    if (pooled) {
      const client = await rawPgPool.connect();
      client.release();
    } else {
      const client = new pg.Client(connectionString);
      await client.connect();
      await client.end();
    }
  });

  bench('open and close dumbo connection', async () => {
    const connection = await pool.connection();
    try {
      await connection.open();
    } finally {
      await connection.close();
    }
  });

  bench('INSERT in transaction', async () => {
    await pool.withTransaction((transaction) =>
      transaction.execute.command(SQL`INSERT INTO cars (brand) VALUES ('bmw')`),
    );
  });

  bench('SELECT single record', async () => {
    await single(pool.execute.query(SQL`SELECT * FROM cars LIMIT 1;`));
  });

  bench('append to new stream (with tx)', async () => {
    await appendWithTransaction(
      `stream-tx-${txCounter++}`,
      '{"type":"created"}',
    );
  });

  bench('append to new stream (raw)', async () => {
    await appendRaw(`stream-raw-${rawCounter++}`, '{"type":"created"}');
  });

  bench('append to existing stream (with tx)', async () => {
    await appendWithTransaction('warm-stream', '{"type":"appended"}');
  });

  bench('append to existing stream (raw)', async () => {
    await appendRaw('warm-stream-raw', '{"type":"appended"}');
  });
});

group('sequential throughput', () => {
  bench('1000 sequential appends (with tx)', async () => {
    const batchId = `seq-tx-${Date.now()}`;
    for (let i = 0; i < 1000; i++) {
      await appendWithTransaction(`${batchId}-${i}`, '{"type":"batch"}');
    }
  });

  bench('1000 sequential appends (raw)', async () => {
    const batchId = `seq-raw-${Date.now()}`;
    for (let i = 0; i < 1000; i++) {
      await appendRaw(`${batchId}-${i}`, '{"type":"batch"}');
    }
  });
});

group('concurrent throughput (Promise.all)', () => {
  bench('1000 concurrent appends to unique streams (with tx)', async () => {
    const batchId = `conc-tx-${Date.now()}`;
    await Promise.all(
      Array.from({ length: 1000 }, (_, i) =>
        appendWithTransaction(`${batchId}-${i}`, '{"type":"concurrent"}'),
      ),
    );
  });

  bench('1000 concurrent appends to unique streams (raw)', async () => {
    const batchId = `conc-raw-${Date.now()}`;
    await Promise.all(
      Array.from({ length: 1000 }, (_, i) =>
        appendRaw(`${batchId}-${i}`, '{"type":"concurrent"}'),
      ),
    );
  });
});

await run();

await rawPgPool.end();
await pool.close();
