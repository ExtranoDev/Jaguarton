// Usage: npm run slots:topup -- --days 14
// Works against whichever DB the current environment points at (dev SQLite, or
// production Postgres when DATABASE_URL and NODE_ENV=production are set).
const db = require('../config/db');
const { topUpSlots } = require('../modules/slots/slots.service');

function readDays(argv) {
  const index = argv.indexOf('--days');
  if (index === -1) return 7;
  const days = Number(argv[index + 1]);
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    throw new Error('--days must be a whole number between 1 and 60');
  }
  return days;
}

async function main() {
  const days = readDays(process.argv.slice(2));
  const result = await topUpSlots({ days });
  console.log(
    `Checked ${result.chargers} chargers over ${result.days} days: created ${result.created} new slots.`
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
