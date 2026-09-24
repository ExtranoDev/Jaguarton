const request = require('supertest');
const app = require('../src/app');
const adminService = require('../src/modules/admin/admin.service');
const {
  db,
  setupDatabase,
  resetDatabase,
  teardownDatabase,
  authHeader,
  createUser,
  createAdmin,
  createScenario,
} = require('./helpers');

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(teardownDatabase);

const as = (user) => authHeader(user);
const admin = (user, method, path, body) => {
  const req = request(app)[method](`/api/admin${path}`).set(as(user));
  return body === undefined ? req : req.send(body);
};
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const auditRows = () => db('admin_actions').orderBy('id');

async function signUp(email = 'ada@test.dev', password = 'first-password', role = 'driver') {
  const res = await request(app).post('/api/auth/signup').send({ name: 'Ada Driver', email, password, role });
  expect(res.status).toBe(201);
  return { ...res.body.user, token: res.body.token };
}

describe('own account', () => {
  it('lets a user change their name, and returns the public user without the hash', async () => {
    const ada = await signUp();

    const res = await request(app).patch('/api/auth/me').set({ Authorization: `Bearer ${ada.token}` }).send({ name: '  Ada Lovelace  ' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: ada.id, name: 'Ada Lovelace', email: 'ada@test.dev', role: 'driver' });
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${ada.token}` })).body.user.name).toBe('Ada Lovelace');
  });

  it('rejects an empty or oversized name, and requires a login', async () => {
    const ada = await signUp();
    const patchName = (name) => request(app).patch('/api/auth/me').set({ Authorization: `Bearer ${ada.token}` }).send({ name });

    expect((await patchName('   ')).status).toBe(400);
    expect((await patchName('x'.repeat(101))).status).toBe(400);
    expect((await request(app).patch('/api/auth/me').send({ name: 'Nope' })).status).toBe(401);
    expect((await db('users').where({ id: ada.id }).first()).name).toBe('Ada Driver');
  });

  it('changes the password when the current one is right; the old one stops working', async () => {
    const ada = await signUp();
    const change = (currentPassword, newPassword) =>
      request(app).post('/api/auth/change-password').set({ Authorization: `Bearer ${ada.token}` }).send({ currentPassword, newPassword });

    const res = await change('first-password', 'second-password');

    expect(res.status).toBe(200);
    expect((await login('ada@test.dev', 'second-password')).status).toBe(200);
    expect((await login('ada@test.dev', 'first-password')).status).toBe(401);
  });

  it('refuses a wrong current password with a 400 (not 401, which would sign the user out)', async () => {
    const ada = await signUp();

    const res = await request(app)
      .post('/api/auth/change-password')
      .set({ Authorization: `Bearer ${ada.token}` })
      .send({ currentPassword: 'not-my-password', newPassword: 'second-password' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/current password is incorrect/i);
    expect((await login('ada@test.dev', 'first-password')).status).toBe(200);
  });

  it('refuses a new password that is too short or unchanged, and requires a login', async () => {
    const ada = await signUp();
    const change = (currentPassword, newPassword) =>
      request(app).post('/api/auth/change-password').set({ Authorization: `Bearer ${ada.token}` }).send({ currentPassword, newPassword });

    expect((await change('first-password', 'short')).status).toBe(400);
    const same = await change('first-password', 'first-password');
    expect(same.status).toBe(400);
    expect(same.body.error).toMatch(/different/i);
    expect((await change('', 'second-password')).status).toBe(400);
    expect((await request(app).post('/api/auth/change-password').send({ currentPassword: 'a', newPassword: 'longenough' })).status).toBe(401);
  });
});

describe('admin: create user', () => {
  it('creates an account that can log in straight away, and logs it', async () => {
    const boss = await createAdmin();

    const res = await admin(boss, 'post', '/users', { name: ' New Operator ', email: 'newop@test.dev', role: 'operator', password: 'welcome-2026' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'New Operator', email: 'newop@test.dev', role: 'operator', is_active: true });
    expect(res.body.user).not.toHaveProperty('password_hash');
    const loggedIn = await login('newop@test.dev', 'welcome-2026');
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body.user.role).toBe('operator');

    const [entry] = await auditRows();
    expect(entry).toMatchObject({ admin_id: boss.id, action: 'user.create', target: `user:${res.body.user.id}`, reason: 'Created as operator' });
    expect(JSON.stringify(entry)).not.toContain('welcome-2026');
    expect((await admin(boss, 'get', '/users?q=newop')).body.users).toHaveLength(1);
  });

  it('can create another admin', async () => {
    const boss = await createAdmin();

    const res = await admin(boss, 'post', '/users', { name: 'Second Admin', email: 'admin2@test.dev', role: 'admin', password: 'welcome-2026' });

    expect(res.status).toBe(201);
    expect((await admin({ id: res.body.user.id, role: 'admin' }, 'get', '/overview')).status).toBe(200);
  });

  it('refuses a duplicate email and creates nothing', async () => {
    const boss = await createAdmin();
    await createUser({ name: 'Taken', email: 'taken@test.dev', role: 'driver' });

    const res = await admin(boss, 'post', '/users', { name: 'Copy', email: 'taken@test.dev', role: 'driver', password: 'welcome-2026' });

    expect(res.status).toBe(409);
    expect(await db('users').where({ email: 'taken@test.dev' })).toHaveLength(1);
    expect(await auditRows()).toHaveLength(0);
  });

  it('validates every field', async () => {
    const boss = await createAdmin();
    const valid = { name: 'Ok', email: 'ok@test.dev', role: 'driver', password: 'welcome-2026' };
    const attempt = (overrides) => admin(boss, 'post', '/users', { ...valid, ...overrides });

    expect((await attempt({ name: '  ' })).status).toBe(400);
    expect((await attempt({ email: 'not-an-email' })).status).toBe(400);
    expect((await attempt({ role: 'root' })).status).toBe(400);
    expect((await attempt({ password: 'short' })).status).toBe(400);
    expect((await attempt({ password: undefined })).status).toBe(400);
    expect(await db('users').where({ email: 'ok@test.dev' })).toHaveLength(0);
  });
});

describe('admin: edit user', () => {
  it('updates name and email, logs what changed, and the user logs in with the new email', async () => {
    const boss = await createAdmin();
    const ada = await signUp();

    const res = await admin(boss, 'put', `/users/${ada.id}`, { name: 'Ada L.', email: 'ada.new@test.dev', role: 'driver' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: ada.id, name: 'Ada L.', email: 'ada.new@test.dev', role: 'driver' });
    expect((await login('ada.new@test.dev', 'first-password')).status).toBe(200);
    expect((await login('ada@test.dev', 'first-password')).status).toBe(401);
    const [entry] = await auditRows();
    expect(entry).toMatchObject({ action: 'user.update', target: `user:${ada.id}`, reason: 'name changed; email changed' });
  });

  it('changes a role where nothing depends on the old one; the old session ends and the next one has the new powers', async () => {
    const boss = await createAdmin();
    const ada = await signUp();

    const res = await admin(boss, 'put', `/users/${ada.id}`, { name: ada.name, email: ada.email, role: 'operator' });

    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${ada.token}` })).status).toBe(401);
    const again = await login(ada.email, 'first-password');
    expect(again.status).toBe(200);
    expect((await request(app).get('/api/operator/stations').set({ Authorization: `Bearer ${again.body.token}` })).status).toBe(200);
    expect((await auditRows())[0].reason).toBe('role driver → operator');
  });

  it('does nothing, and logs nothing, when nothing changed', async () => {
    const boss = await createAdmin();
    const ada = await signUp();

    const res = await admin(boss, 'put', `/users/${ada.id}`, { name: ada.name, email: ada.email, role: ada.role });

    expect(res.status).toBe(200);
    expect(await auditRows()).toHaveLength(0);
  });

  it('refuses an email that another account has', async () => {
    const boss = await createAdmin();
    const ada = await signUp();
    await createUser({ name: 'Other', email: 'other@test.dev', role: 'driver' });

    const res = await admin(boss, 'put', `/users/${ada.id}`, { name: ada.name, email: 'other@test.dev', role: 'driver' });

    expect(res.status).toBe(409);
    expect((await db('users').where({ id: ada.id }).first()).email).toBe('ada@test.dev');
  });

  it('will not change the role of an operator who owns stations, or a driver who has bookings', async () => {
    const boss = await createAdmin();
    const { operator, driver, slots } = await createScenario();
    await request(app).post('/api/bookings').set(as(driver)).send({ slotId: slots[0].id });

    const opRes = await admin(boss, 'put', `/users/${operator.id}`, { name: operator.name, email: operator.email, role: 'driver' });
    const drRes = await admin(boss, 'put', `/users/${driver.id}`, { name: driver.name, email: driver.email, role: 'operator' });

    expect(opRes.status).toBe(409);
    expect(opRes.body.error).toMatch(/owns stations/i);
    expect(drRes.status).toBe(409);
    expect(drRes.body.error).toMatch(/has bookings/i);
    expect((await db('users').where({ id: operator.id }).first()).role).toBe('operator');
    expect((await db('users').where({ id: driver.id }).first()).role).toBe('driver');
    // Their name can still be corrected.
    expect((await admin(boss, 'put', `/users/${operator.id}`, { name: 'Renamed Op', email: operator.email, role: 'operator' })).status).toBe(200);
  });

  it('lets an admin fix their own name but not their own role', async () => {
    const boss = await createAdmin();
    await createAdmin({ email: 'admin2@test.dev' });

    expect((await admin(boss, 'put', `/users/${boss.id}`, { name: 'Renamed Boss', email: boss.email, role: 'admin' })).status).toBe(200);
    const demote = await admin(boss, 'put', `/users/${boss.id}`, { name: 'Renamed Boss', email: boss.email, role: 'driver' });

    expect(demote.status).toBe(400);
    expect((await db('users').where({ id: boss.id }).first()).role).toBe('admin');
  });

  it('demotes another admin only while an active admin remains', async () => {
    const boss = await createAdmin();
    const other = await createAdmin({ email: 'admin2@test.dev' });

    const res = await admin(boss, 'put', `/users/${other.id}`, { name: other.name, email: other.email, role: 'driver' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('driver');
  });

  it('never leaves the platform without an active admin', async () => {
    const sole = await createAdmin();
    const suspended = await createAdmin({ email: 'admin2@test.dev', is_active: false });

    await expect(
      adminService.updateUser(suspended.id, sole.id, { name: sole.name, email: sole.email, role: 'driver' })
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/last active admin/i) });

    expect((await db('users').where({ id: sole.id }).first()).role).toBe('admin');
  });

  it('validates the body and the target', async () => {
    const boss = await createAdmin();
    const ada = await signUp();
    const valid = { name: ada.name, email: ada.email, role: 'driver' };

    expect((await admin(boss, 'put', `/users/${ada.id}`, { ...valid, email: 'nope' })).status).toBe(400);
    expect((await admin(boss, 'put', `/users/${ada.id}`, { ...valid, role: 'root' })).status).toBe(400);
    expect((await admin(boss, 'put', `/users/${ada.id}`, { ...valid, name: '' })).status).toBe(400);
    expect((await admin(boss, 'put', '/users/99999', valid)).status).toBe(404);
  });
});

describe('admin: reset password', () => {
  it('generates a temporary password, returns it once, and the old password stops working', async () => {
    const boss = await createAdmin();
    const ada = await signUp();

    const res = await admin(boss, 'post', `/users/${ada.id}/reset-password`, {});

    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(res.body.user).toMatchObject({ id: ada.id, email: 'ada@test.dev' });
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect((await login('ada@test.dev', res.body.temporaryPassword)).status).toBe(200);
    expect((await login('ada@test.dev', 'first-password')).status).toBe(401);

    // The audit log records that it happened, never the password.
    const [entry] = await auditRows();
    expect(entry).toMatchObject({ action: 'user.reset_password', target: `user:${ada.id}`, reason: 'Temporary password generated' });
    expect(JSON.stringify(await db('admin_actions'))).not.toContain(res.body.temporaryPassword);
  });

  it('generates a different password each time', async () => {
    const boss = await createAdmin();
    const ada = await signUp();

    const first = await admin(boss, 'post', `/users/${ada.id}/reset-password`, {});
    const second = await admin(boss, 'post', `/users/${ada.id}/reset-password`, {});

    expect(first.body.temporaryPassword).not.toBe(second.body.temporaryPassword);
  });

  it('sets the password an admin chose, without echoing it back', async () => {
    const boss = await createAdmin();
    const ada = await signUp();

    const res = await admin(boss, 'post', `/users/${ada.id}/reset-password`, { password: 'chosen-by-admin' });

    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('chosen-by-admin');
    expect((await login('ada@test.dev', 'chosen-by-admin')).status).toBe(200);
    expect((await auditRows())[0].reason).toBe('Password set by an admin');
  });

  it('works for a suspended user too (they still cannot log in until reactivated)', async () => {
    const boss = await createAdmin();
    const ada = await signUp();
    await admin(boss, 'patch', `/users/${ada.id}`, { isActive: false });

    const res = await admin(boss, 'post', `/users/${ada.id}/reset-password`, {});

    expect(res.status).toBe(200);
    expect((await login('ada@test.dev', res.body.temporaryPassword)).status).toBe(403);
  });

  it('refuses a short password, an unknown user, and resetting your own password', async () => {
    const boss = await createAdmin();
    const ada = await signUp();

    expect((await admin(boss, 'post', `/users/${ada.id}/reset-password`, { password: 'short' })).status).toBe(400);
    expect((await admin(boss, 'post', '/users/99999/reset-password', {})).status).toBe(404);
    const self = await admin(boss, 'post', `/users/${boss.id}/reset-password`, {});
    expect(self.status).toBe(400);
    expect(self.body.error).toMatch(/account settings/i);
    expect((await login('ada@test.dev', 'first-password')).status).toBe(200);
  });
});
