import { type D1ClientOptions } from '../connections/connection';

export type D1DumboConnectionOptions = D1ClientOptions;

// export const d1AmbientClientPool = (
//   options: D1DumboConnectionOptions,
// ): SQLiteAmbientClientPool<typeof D1DriverType> => {
//   const client = d1Client(options);

//   // D1 uses ambient pool - single binding instance
//   return createConnectionPool({
//     driverType: D1DriverType,
//     getConnection: () =>
//       d1ClientConnection({
//         driverType: D1DriverType,
//         client,
//       }),
//     connection: () => Promise.resolve(/* connection */),
//     close: () => Promise.resolve(),
//   });
// };
