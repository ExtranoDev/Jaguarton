require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production',
  // Comma-separated list, e.g. "https://echargefind.vercel.app,http://localhost:5173"
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // The timezone that "a day" means for slots and availability. Hosts like
  // Render run in UTC, so this must never depend on the server's local clock.
  appTimezone: process.env.APP_TIMEZONE || 'Africa/Lagos',
  // If set (e.g. 7), the server keeps that many days of slots topped up.
  autoTopUpSlotDays: parseInt(process.env.AUTO_TOP_UP_SLOTS_DAYS, 10) || 0,
};
