const path = require('path');
require('dotenv').config();

const sqliteConfig = (filename) => ({
  client: 'better-sqlite3',
  useNullAsDefault: true,
  connection: { filename },
  pool: {
    afterCreate: (conn, cb) => {
      conn.pragma('foreign_keys = ON');
      cb();
    },
  },
  migrations: { directory: path.join(__dirname, 'migrations') },
  seeds: { directory: path.join(__dirname, 'seeds') },
});

const pgConfig = (connectionString, ssl = false) => ({
  client: 'pg',
  connection: { connectionString, ssl },
  migrations: { directory: path.join(__dirname, 'migrations') },
  seeds: { directory: path.join(__dirname, 'seeds') },
});

// DB_CLIENT=pg lets you point "development" at a real Postgres (e.g. Neon)
// before deploying, without touching migrations/seeds.
const useSqliteForDev = (process.env.DB_CLIENT || 'sqlite3') !== 'pg';

module.exports = {
  development: useSqliteForDev
    ? sqliteConfig(path.join(__dirname, 'data', 'dev.sqlite3'))
    : pgConfig(process.env.DATABASE_URL),
  // The test suite wipes every table between tests, so it only ever uses
  // TEST_DATABASE_URL (never DATABASE_URL) to make pointing it at real data hard.
  test: process.env.TEST_DATABASE_URL
    ? pgConfig(process.env.TEST_DATABASE_URL)
    : sqliteConfig(path.join(__dirname, 'data', 'test.sqlite3')),
  production: pgConfig(process.env.DATABASE_URL, { rejectUnauthorized: false }),
};
