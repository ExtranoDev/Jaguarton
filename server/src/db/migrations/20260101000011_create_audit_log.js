// Replaces admin_actions with audit_log: one history of security events, operator changes, the
// booking lifecycle and admin actions.
//
// Rows are detached from the rows they describe. There are no foreign keys: the actor's and target's
// name and email are copied in when the entry is written, so the log still reads correctly after
// someone is renamed, and nothing can ever block (or cascade into) deleting a user or station.
// Entries are kept forever, except failed logins, which carry an expires_at 90 days out and are
// purged by the maintenance job.
//
// Existing admin_actions rows are copied across, with names resolved now (they were only ids),
// and admin_actions is dropped. Safe to re-run on Postgres: each step checks what already exists.

const ACTIONS_TABLE = 'admin_actions';

function createAuditLog(knex) {
  return knex.schema.createTable('audit_log', (table) => {
    table.increments('id').primary();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.string('action', 64).notNullable();
    table.string('category', 16).notNullable(); // security | operator | booking | admin
    table.integer('actor_id'); // no FK on purpose, see above
    table.string('actor_role', 16);
    table.string('actor_name', 255);
    table.string('actor_email', 255);
    table.string('target_type', 32);
    table.integer('target_id');
    table.string('target_name', 255);
    table.string('target_email', 255);
    table.integer('station_id'); // set for events at a station, so its operator can see them
    table.integer('owner_id');
    table.text('reason');
    table.text('changes'); // JSON: { field: { from, to } }
    table.text('details'); // JSON: anything else worth keeping (counts, dates, method)
    table.string('ip', 64);
    table.string('user_agent', 255);
    table.timestamp('expires_at');
    table.index(['created_at']);
    table.index(['action']);
    table.index(['actor_id']);
    table.index(['target_type', 'target_id']);
    table.index(['owner_id', 'created_at']);
    table.index(['expires_at']);
  });
}

const byId = (rows) => new Map(rows.map((row) => [row.id, row]));
const idsOf = (rows, type) => rows.filter((row) => row.target.startsWith(`${type}:`)).map((row) => Number(row.target.split(':')[1]));

async function copyAdminActions(knex) {
  const rows = await knex(ACTIONS_TABLE).orderBy('id');
  if (rows.length === 0) return;

  const users = byId(await knex('users').whereIn('id', [...rows.map((r) => r.admin_id), ...idsOf(rows, 'user')]));
  const stations = byId(await knex('stations').whereIn('id', idsOf(rows, 'station')));
  const chargers = byId(
    await knex('chargers as c')
      .innerJoin('stations as s', 's.id', 'c.station_id')
      .whereIn('c.id', idsOf(rows, 'charger'))
      .select('c.id', 'c.station_id', 's.name as station_name', 's.owner_id')
  );
  const bookings = byId(
    await knex('bookings as b')
      .innerJoin('stations as s', 's.id', 'b.station_id')
      .innerJoin('users as u', 'u.id', 'b.user_id')
      .whereIn('b.id', idsOf(rows, 'booking'))
      .select('b.id', 'b.booking_reference', 'b.station_id', 's.owner_id', 'u.email as driver_email')
  );

  const entries = rows.map((row) => {
    const admin = users.get(row.admin_id);
    const [type, rawId] = row.target.split(':');
    const id = Number(rawId);
    const target = { target_type: type, target_id: Number.isInteger(id) ? id : null };
    if (type === 'user' && users.has(id)) Object.assign(target, { target_name: users.get(id).name, target_email: users.get(id).email });
    if (type === 'station' && stations.has(id)) {
      const station = stations.get(id);
      Object.assign(target, { target_name: station.name, station_id: id, owner_id: station.owner_id });
    }
    if (type === 'charger' && chargers.has(id)) {
      const charger = chargers.get(id);
      Object.assign(target, {
        target_name: `Charger #${id} · ${charger.station_name}`,
        station_id: charger.station_id,
        owner_id: charger.owner_id,
      });
    }
    if (type === 'booking' && bookings.has(id)) {
      const booking = bookings.get(id);
      Object.assign(target, {
        target_name: booking.booking_reference,
        target_email: booking.driver_email,
        station_id: booking.station_id,
        owner_id: booking.owner_id,
      });
    }
    if (row.target === 'chargers:all') Object.assign(target, { target_type: 'chargers', target_name: 'All chargers' });

    return {
      created_at: row.created_at,
      action: row.action,
      category: row.action === 'booking.cancel' ? 'booking' : 'admin',
      actor_id: row.admin_id,
      actor_role: 'admin',
      actor_name: admin?.name ?? null,
      actor_email: admin?.email ?? null,
      reason: row.reason,
      ...target,
    };
  });

  for (let i = 0; i < entries.length; i += 100) {
    await knex('audit_log').insert(entries.slice(i, i + 100));
  }
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('audit_log'))) await createAuditLog(knex);
  if (await knex.schema.hasTable(ACTIONS_TABLE)) {
    await copyAdminActions(knex);
    await knex.schema.dropTable(ACTIONS_TABLE);
  }
};

// Puts admin_actions back with the admin entries whose admin still exists. Everything else in
// audit_log (security, operator and booking events) has no home in the old table and is lost.
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable(ACTIONS_TABLE))) {
    await knex.schema.createTable(ACTIONS_TABLE, (table) => {
      table.increments('id').primary();
      table.integer('admin_id').unsigned().notNullable().references('id').inTable('users').onDelete('RESTRICT');
      table.string('action').notNullable();
      table.string('target').notNullable();
      table.text('reason');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['created_at']);
    });
  }
  if (await knex.schema.hasTable('audit_log')) {
    const rows = await knex('audit_log as a')
      .innerJoin('users as u', 'u.id', 'a.actor_id')
      .where('a.actor_role', 'admin')
      .orderBy('a.id')
      .select('a.*');
    const restored = rows.map((row) => ({
      admin_id: row.actor_id,
      action: row.action,
      target: row.target_type === 'chargers' ? 'chargers:all' : `${row.target_type}:${row.target_id}`,
      reason: row.reason,
      created_at: row.created_at,
    }));
    for (let i = 0; i < restored.length; i += 100) {
      await knex(ACTIONS_TABLE).insert(restored.slice(i, i + 100));
    }
    await knex.schema.dropTable('audit_log');
  }
};
