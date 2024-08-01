// import {
//   PostgreSqlContainer,
//   type StartedPostgreSqlContainer,
// } from '@testcontainers/postgresql';
// import { after, before, describe, it } from 'node:test';
// import pg from 'pg';
// import { executeSQL } from '..';
// import { rawSql } from '../../sql';

// void describe('PostgreSQL connection', () => {
//   let postgres: StartedPostgreSqlContainer;
//   let connectionString: string;

//   before(async () => {
//     postgres = await new PostgreSqlContainer().start();
//     connectionString = postgres.getConnectionUri();
//   });

//   after(async () => {
//     await postgres.stop();
//   });

//   void describe('executeSQL', () => {
//     void it('connects using pool', async () => {
//       const pool = new pg.Pool({ connectionString });

//       try {
//         await executeSQL(pool, rawSql('SELECT 1'));
//       } catch (error) {
//         console.log(error);
//       } finally {
//         await pool.end();
//       }
//     });

//     void it('connects using connected pool client', async () => {
//       const pool = new pg.Pool({ connectionString });
//       const poolClient = await pool.connect();

//       try {
//         await executeSQL(poolClient, rawSql('SELECT 1'));
//       } finally {
//         poolClient.release();
//         await pool.end();
//       }
//     });

//     void it('connects using connected client', async () => {
//       const client = new pg.Client({ connectionString });
//       await client.connect();

//       try {
//         await executeSQL(client, rawSql('SELECT 1'));
//       } finally {
//         await client.end();
//       }
//     });
//   });
// });
