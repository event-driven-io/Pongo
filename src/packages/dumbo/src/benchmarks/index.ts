import 'dotenv/config';

import Benchmark from 'benchmark';
import pg from 'pg';
import { defaultPostgreSQLConenctionString, dumbo, rawSql, single } from '..';

const connectionString =
  process.env.BENCHMARK_POSTGRESQL_CONNECTION_STRING ??
  defaultPostgreSQLConenctionString;

const pooled = process.env.BENCHMARK_CONNECTION_POOLED === 'true';

const pool = dumbo({
  connectionString,
  pooled,
});

const rawPgPool = new pg.Pool({ connectionString });

const setup = () =>
  pool.execute.command(
    rawSql(`
      CREATE TABLE IF NOT EXISTS cars (
        id SERIAL PRIMARY KEY, 
        brand VARCHAR(255)
      );`),
  );

const openAndCloseRawConnection = async () => {
  if (pooled) {
    const client = await rawPgPool.connect();
    client.release();
  } else {
    const client = new pg.Client(connectionString);
    await client.connect();
    await client.end();
  }
};

const openAndCloseDumboConnection = async () => {
  const connection = await pool.connection();
  try {
    await connection.open();
  } finally {
    await connection.close();
  }
};

const getRecord = () =>
  single(pool.execute.query(rawSql(`SELECT * FROM cars LIMIT 1;`)));

// Function to update a record by ID
const insertRecord = () =>
  pool.withTransaction((transaction) =>
    transaction.execute.command(
      rawSql(`INSERT INTO cars (brand) VALUES ('bmw')`),
    ),
  );

// Setup Benchmark.js
async function runBenchmark() {
  await setup();

  const suite = new Benchmark.Suite();

  suite
    .add('Opening and closing raw connection', {
      defer: true,
      fn: async function (deferred: Benchmark.Deferred) {
        await openAndCloseRawConnection();
        deferred.resolve();
      },
    })
    .add('Opening and closing connection', {
      defer: true,
      fn: async function (deferred: Benchmark.Deferred) {
        await openAndCloseDumboConnection();
        deferred.resolve();
      },
    })
    .add('INSERTING records in transaction', {
      defer: true,
      fn: async function (deferred: Benchmark.Deferred) {
        await insertRecord();
        deferred.resolve();
      },
    })
    .add('READING records', {
      defer: true,
      fn: async function (deferred: Benchmark.Deferred) {
        await getRecord();
        deferred.resolve();
      },
    })
    .on('cycle', function (event: Benchmark.Event) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      console.log(String(event.target));
    })
    .on('complete', async function (this: Benchmark.Suite) {
      this.forEach((bench: Benchmark.Target) => {
        const stats = bench.stats;
        console.log(`\nBenchmark: ${bench.name}`);
        console.log(`  Operations per second: ${bench.hz!.toFixed(2)} ops/sec`);
        console.log(
          `  Mean execution time: ${(stats!.mean * 1000).toFixed(2)} ms`,
        );
        console.log(
          `  Standard deviation: ${(stats!.deviation * 1000).toFixed(2)} ms`,
        );
        console.log(`  Margin of error: ±${stats!.rme.toFixed(2)}%`);
        console.log(`  Sample size: ${stats!.sample.length} runs`);
        console.log();
      });

      console.log('Benchmarking complete.');
      await rawPgPool.end();
      return pool.close(); // Close the database connection
    })
    // Run the benchmarks
    .run({ async: true });
}

runBenchmark().catch(console.error);
