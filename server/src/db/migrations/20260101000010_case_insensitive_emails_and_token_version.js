// Two account-safety changes to `users`:
//   - Emails become case-insensitive: every stored email is lower-cased, and a unique index on
//     lower(email) stops "Ada@x.com" and "ada@x.com" ever being two accounts again. If two
//     accounts already differ only by case, the migration stops and names them rather than
//     guessing which to keep; merge or rename one by hand, then deploy again.
//   - token_version: every issued token carries it (claim "tv"), and bumping it (password change
//     or reset, role change) makes all of that user's older tokens stop working.
// Written to be safe to re-run on Postgres (Render runs `npm run migrate` on every deploy), and on
// SQLite it only ever ADDs a column or index: no table rebuild, so nothing can cascade.

const EMAIL_INDEX = 'users_email_lower_unique';

async function assertNoCaseCollisions(knex) {
  const collisions = await knex('users')
    .select(knex.raw('lower(email) as email'))
    .count('* as n')
    .groupByRaw('lower(email)')
    .havingRaw('count(*) > 1');
  if (collisions.length > 0) {
    const list = collisions.map((row) => `${row.email} (${row.n} accounts)`).join(', ');
    throw new Error(
      `Cannot make emails case-insensitive: these addresses belong to more than one account when case is ignored: ${list}. ` +
        'Rename or merge the duplicates, then run the migration again.'
    );
  }
}

exports.up = async function up(knex) {
  await assertNoCaseCollisions(knex);
  await knex('users').whereRaw('email <> lower(email)').update({ email: knex.raw('lower(email)') });
  await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ${EMAIL_INDEX} ON users (lower(email))`);

  if (!(await knex.schema.hasColumn('users', 'token_version'))) {
    await knex.schema.alterTable('users', (table) => {
      table.integer('token_version').notNullable().defaultTo(0);
    });
  }
};

// Emails stay lower-cased (the original casing is gone). Plain DROP COLUMN, as in migration 8, so
// SQLite doesn't rebuild the table.
exports.down = async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS ${EMAIL_INDEX}`);
  if (await knex.schema.hasColumn('users', 'token_version')) {
    await knex.raw('ALTER TABLE users DROP COLUMN token_version');
  }
};
