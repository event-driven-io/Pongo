import fs from 'fs';
import { bench, group, run, summary } from 'mitata';
import os from 'os';
import path from 'path';
import { SQL } from '../core';
import { sqlite3Pool } from '../storage/sqlite/sqlite3';

const dbPath = path.join(os.tmpdir(), `dumbo-bench-${Date.now()}.db`);

const pool = sqlite3Pool({
  fileName: dbPath,
  transactionOptions: { allowNestedTransactions: true },
});

const setup = async () => {
  await pool.execute.command(
    SQL`CREATE TABLE bench_streams (
      stream_id TEXT PRIMARY KEY,
      stream_position INTEGER NOT NULL DEFAULT 0
    )`,
  );
  await pool.execute.command(
    SQL`CREATE TABLE bench_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stream_id TEXT NOT NULL,
      stream_position INTEGER NOT NULL,
      data TEXT NOT NULL
    )`,
  );
};

const appendWithTransaction = async (streamId: string, data: string) =>
  pool.withTransaction(async (tx) => {
    const streamResult = await tx.execute.command<{
      stream_position: number;
    }>(
      SQL`INSERT INTO bench_streams (stream_id, stream_position)
        VALUES (${streamId}, 1)
        ON CONFLICT (stream_id) DO UPDATE
          SET stream_position = stream_position + 1
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
        SET stream_position = stream_position + 1
      RETURNING stream_position`,
  );

  const position = streamResult.rows[0]!.stream_position;

  await pool.execute.command<{ id: number }>(
    SQL`INSERT INTO bench_messages (stream_id, stream_position, data)
      VALUES (${streamId}, ${position}, ${data})
      RETURNING id`,
  );
};

async function main() {
  await setup();

  // Pre-create streams for the "existing stream" benchmarks
  await appendWithTransaction('warm-stream', '{"type":"warmup"}');
  await appendRaw('warm-stream-raw', '{"type":"warmup"}');

  let txCounter = 0;
  let rawCounter = 0;

  summary(() => {
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

  const results = await run();

  const rows = results.benchmarks.flatMap((trial) =>
    trial.runs
      .filter((r) => r.stats !== undefined)
      .map((r) => {
        const match = r.name.match(/^(\d+)\s/);
        const multiplier = match ? parseInt(match[1]!, 10) : 1;
        const opsPerSec = Math.round((multiplier * 1e9) / r.stats.avg);
        return { name: r.name, opsPerSec };
      }),
  );

  const nameWidth = Math.max(...rows.map((r) => r.name.length));
  console.log('\nops/sec');
  console.log('-'.repeat(nameWidth + 20));
  for (const { name, opsPerSec } of rows) {
    console.log(
      `${name.padEnd(nameWidth)}  ${opsPerSec.toLocaleString().padStart(12)} ops/sec`,
    );
  }

  await pool.close();
}

try {
  await main();
} finally {
  try {
    fs.unlinkSync(dbPath);
    fs.unlinkSync(`${dbPath}-shm`);
    fs.unlinkSync(`${dbPath}-wal`);
  } catch {
    // DB files may not all exist
  }
}
