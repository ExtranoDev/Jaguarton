const knex = require('knex');
const { types } = require('pg');
const knexfile = require('../db/knexfile');
const { nodeEnv } = require('./env');

// Postgres returns NUMERIC/DECIMAL columns (prices, lat/lng) as strings, while
// SQLite returns numbers. Parse them so the API behaves identically on both.
types.setTypeParser(types.builtins.NUMERIC, parseFloat);

const config = knexfile[nodeEnv] || knexfile.development;
const db = knex(config);

module.exports = db;
