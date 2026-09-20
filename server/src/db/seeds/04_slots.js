const { buildSlotRows } = require('../../modules/slots/slotRows');
const { toZonedDateString, addDaysToDateString } = require('../../utils/time');

const DAYS_AHEAD = 7;

exports.seed = async function seed(knex) {
  const chargers = await knex('chargers').select('id').orderBy('id');
  if (chargers.length === 0) {
    throw new Error('No chargers found — run 03_chargers seed first');
  }

  const today = toZonedDateString(new Date());
  const now = Date.now();
  const allSlots = [];

  for (const charger of chargers) {
    for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
      const dateStr = addDaysToDateString(today, offset);
      for (const row of buildSlotRows(charger.id, dateStr)) {
        if (Date.parse(row.start_time) > now) allSlots.push(row); // don't create past slots
      }
    }
  }

  await knex.batchInsert('slots', allSlots, 200);
};
