const { nodeEnv, port, autoTopUpSlotDays } = require('./config/env');

// Refuse to start production with the built-in dev secret: anyone could forge tokens.
if (nodeEnv === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET must be set when NODE_ENV=production');
  process.exit(1);
}

const app = require('./app');
const { topUpSlots } = require('./modules/slots/slots.service');
const { purgeExpired } = require('./modules/audit/audit.service');

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function scheduleSlotTopUp(days) {
  const run = () =>
    topUpSlots({ days })
      .then((result) => console.log(`Slot top-up: ${result.created} new slots over the next ${days} days`))
      .catch((err) => console.error('Slot top-up failed:', err.message));
  run();
  setInterval(run, SIX_HOURS_MS).unref();
}

// Failed-login audit entries are kept for 90 days; everything else in the audit log is kept.
function scheduleAuditPurge() {
  const run = () =>
    purgeExpired()
      .then((removed) => removed > 0 && console.log(`Audit log: removed ${removed} expired failed-login entries`))
      .catch((err) => console.error('Audit log purge failed:', err.message));
  run();
  setInterval(run, SIX_HOURS_MS).unref();
}

app.listen(port, () => {
  console.log(`EV charging server listening on port ${port}`);
  if (autoTopUpSlotDays > 0) scheduleSlotTopUp(autoTopUpSlotDays);
  scheduleAuditPurge();
});
