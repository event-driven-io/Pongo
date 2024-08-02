import type { Connection } from '../connections';

export const execute = async <
  Result = void,
  ConnectionType extends Connection = Connection,
>(
  connection: ConnectionType,
  handle: (client: ReturnType<ConnectionType['connect']>) => Promise<Result>,
) => {
  const client = connection.connect();

  try {
    return await handle(client as ReturnType<ConnectionType['connect']>);
  } finally {
    await connection.close();
  }
};

// export const executeInTransaction = async <
//   Result = void,
//   ConnectionType extends Connection = Connection,
// >(
//   connection: ConnectionType,
//   handle: (
//     client: ReturnType<ConnectionType['open']>,
//   ) => Promise<{ success: boolean; result: Result }>,
// ): Promise<Result> =>
//   execute(connection, async (client) => {
//     const transaction = await connection.transaction();

//     try {
//       const { success, result } = await handle(client);

//       if (success) await transaction.commit();
//       else await transaction.rollback();

//       return result;
//     } catch (e) {
//       await transaction.rollback();
//       throw e;
//     }
//   });

// const getExecutor = <ConnectionType extends Connection = Connection>(
//   _connectorType: ConnectionType['type'],
// ): SQLExecutor => ({
//   type: '',
//   query: <Result extends QueryResultRow = QueryResultRow>(
//     _client: ReturnType<ConnectionType['connect']>,
//     _queryTextOrConfig: SQL,
//   ): Promise<QueryResult<Result>> => Promise.reject('Not Implemented!'),
// });

// export const executeSQL = async <
//   Result extends QueryResultRow = QueryResultRow,
//   ConnectionType extends Connection = Connection,
// >(
//   connection: ConnectionType,
//   sql: SQL,
// ): Promise<QueryResult<Result>> => connection.execute.query<Result>(sql);

// export const executeSQLInTransaction = async <
//   Result extends QueryResultRow = QueryResultRow,
//   ConnectionType extends Connection = Connection,
// >(
//   connection: ConnectionType,
//   sql: SQL,
// ) => {
//   console.log(sql);
//   return executeInTransaction(connection, async (client) => ({
//     success: true,
//     result: await getExecutor(connection.type).query<Result>(client, sql),
//   }));
// };

// export const executeSQLBatchInTransaction = async <
//   Result extends QueryResultRow = QueryResultRow,
//   ConnectionType extends Connection = Connection,
// >(
//   connection: ConnectionType,
//   ...sqls: SQL[]
// ) =>
//   executeInTransaction(connection, async (client) => {
//     for (const sql of sqls) {
//       await getExecutor(connection.type).query<Result>(client, sql);
//     }

//     return { success: true, result: undefined };
//   });
