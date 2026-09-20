// users.role is a CHECK constraint (knex enu with useNative:false) on both engines,
// and neither can simply add a value to it:
//   - Postgres: swap the constraint in place (DROP + ADD in the migration transaction).
//   - SQLite: CHECK constraints can't be altered, so the table is rebuilt using the
//     procedure from https://sqlite.org/lang_altertable.html#otheralter
// SQLite is the risky one. Dropping `users` with foreign keys ON would cascade-delete
// every station and booking (they reference users ON DELETE CASCADE), and
// `PRAGMA foreign_keys` is a no-op inside a transaction, hence transaction:false and the
// explicit checks below that abort before anything destructive if the pragma didn't stick.
exports.config = { transaction: false };

const isPostgres = (knex) => knex.client.config.client === 'pg';

async function swapPostgresConstraint(knex, roles) {
  const list = roles.map((role) => `'${role}'`).join(', ');
  await knex.transaction(async (trx) => {
    await trx.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
    await trx.raw(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${list}))`);
  });
}

async function rebuildSqliteUsers(knex, roles) {
  await knex.raw('PRAGMA foreign_keys = OFF');
  try {
    await knex.transaction(async (trx) => {
      const [{ foreign_keys: foreignKeysOn }] = await trx.raw('PRAGMA foreign_keys');
      if (foreignKeysOn) {
        throw new Error('Could not disable SQLite foreign keys; refusing to rebuild users (it would cascade-delete data)');
      }

      const [sequence] = await trx.raw("SELECT seq FROM sqlite_sequence WHERE name = 'users'");

      await trx.schema.createTable('users_new', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.string('email').notNullable();
        table.string('password_hash').notNullable();
        table.enu('role', roles, { useNative: false, enumName: null }).notNullable();
        table.timestamps(true, true);
      });
      await trx.raw(`
        INSERT INTO users_new (id, name, email, password_hash, role, created_at, updated_at)
        SELECT id, name, email, password_hash, role, created_at, updated_at FROM users
      `);
      await trx.raw('DROP TABLE users');
      await trx.raw('ALTER TABLE users_new RENAME TO users');
      await trx.schema.alterTable('users', (table) => table.unique('email'));

      // AUTOINCREMENT must keep counting from where it was, or ids of deleted users get reused.
      if (sequence) {
        await trx.raw("DELETE FROM sqlite_sequence WHERE name = 'users'");
        await trx.raw("INSERT INTO sqlite_sequence (name, seq) VALUES ('users', ?)", [sequence.seq]);
      }

      const violations = await trx.raw('PRAGMA foreign_key_check');
      if (violations.length > 0) {
        throw new Error('Rebuilding users left dangling foreign keys; rolled back');
      }
    });
  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}

async function setRoles(knex, roles) {
  if (isPostgres(knex)) return swapPostgresConstraint(knex, roles);
  return rebuildSqliteUsers(knex, roles);
}

exports.up = function up(knex) {
  return setRoles(knex, ['driver', 'operator', 'admin']);
};

exports.down = async function down(knex) {
  // The old constraint can't hold admin rows. Delete them first, while foreign keys are
  // still enforced, so anything that references them goes with them instead of dangling.
  await knex('users').where({ role: 'admin' }).del();
  await setRoles(knex, ['driver', 'operator']);
};
