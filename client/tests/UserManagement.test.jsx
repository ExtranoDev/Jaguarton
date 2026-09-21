import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import AdminDashboardPage from '../src/pages/AdminDashboardPage.jsx';
import { API, server, signInAs } from './server.js';

const admin = { id: 1, name: 'Ifeoma Balogun', email: 'admin@example.com', role: 'admin', is_active: true };

// An in-memory stand-in for the user endpoints that records what the UI sends.
function mockUsersApi() {
  const state = {
    users: [
      { ...admin, created_at: '2026-09-01T09:00:00.000Z' },
      { id: 2, name: 'Chidi Nwosu', email: 'driver@example.com', role: 'driver', is_active: true, created_at: '2026-09-02T09:00:00.000Z' },
    ],
    requests: {},
  };
  const find = (id) => state.users.find((u) => u.id === Number(id));

  signInAs(admin);
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ user: admin })),
    http.get(`${API}/admin/users`, () => HttpResponse.json({ users: state.users })),
    http.post(`${API}/admin/users`, async ({ request }) => {
      const body = await request.json();
      state.requests.create = body;
      const user = { id: 10, ...body, is_active: true, created_at: '2026-09-21T09:00:00.000Z' };
      delete user.password;
      state.users.push(user);
      return HttpResponse.json({ user }, { status: 201 });
    }),
    http.put(`${API}/admin/users/:id`, async ({ request, params }) => {
      const body = await request.json();
      state.requests.update = { id: Number(params.id), ...body };
      Object.assign(find(params.id), body);
      return HttpResponse.json({ user: find(params.id) });
    }),
    http.post(`${API}/admin/users/:id/reset-password`, async ({ request, params }) => {
      const body = await request.json();
      state.requests.reset = { id: Number(params.id), body };
      return HttpResponse.json({
        user: find(params.id),
        temporaryPassword: body.password ? undefined : 'Tmp9Xk2mQz4R',
      });
    })
  );
  return state;
}

function renderUsers() {
  return render(
    <MemoryRouter initialEntries={['/admin?tab=users']}>
      <AuthProvider>
        <AdminDashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

const usersTable = () => screen.getByRole('table', { name: 'Users' });
const rowFor = (name) => within(usersTable()).getByText(name).closest('tr');
const dialog = (name) => screen.getByRole('dialog', { name });

describe('adding a user', () => {
  it('creates an account with a generated password and shows it in the list', async () => {
    const user = userEvent.setup();
    const state = mockUsersApi();
    renderUsers();
    await screen.findByText('Chidi Nwosu');

    await user.click(screen.getByRole('button', { name: '+ Add user' }));
    const form = dialog('Add a user');
    const create = within(form).getByRole('button', { name: 'Create user' });
    expect(create).toBeDisabled(); // nothing filled in yet

    await user.type(within(form).getByLabelText('Name'), 'Tunde Bakare');
    await user.type(within(form).getByLabelText('Email'), 'tunde@example.com');
    await user.selectOptions(within(form).getByLabelText('Role'), 'operator');
    expect(create).toBeDisabled(); // still no password
    await user.click(within(form).getByRole('button', { name: 'Generate' }));
    const generated = within(form).getByLabelText('Password').value;
    expect(generated).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(create).toBeEnabled();
    await user.click(create);

    expect(await within(usersTable()).findByText('Tunde Bakare')).toBeInTheDocument();
    expect(state.requests.create).toEqual({ name: 'Tunde Bakare', email: 'tunde@example.com', role: 'operator', password: generated });
    expect(screen.getByRole('status')).toHaveTextContent('Created Tunde Bakare.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('will not enable Create for a short password or a bad email', async () => {
    const user = userEvent.setup();
    mockUsersApi();
    renderUsers();
    await screen.findByText('Chidi Nwosu');

    await user.click(screen.getByRole('button', { name: '+ Add user' }));
    const form = dialog('Add a user');
    await user.type(within(form).getByLabelText('Name'), 'Tunde Bakare');
    await user.type(within(form).getByLabelText('Email'), 'not-an-email');
    await user.type(within(form).getByLabelText('Password'), 'longenough');
    expect(within(form).getByRole('button', { name: 'Create user' })).toBeDisabled();

    await user.clear(within(form).getByLabelText('Email'));
    await user.type(within(form).getByLabelText('Email'), 'tunde@example.com');
    await user.clear(within(form).getByLabelText('Password'));
    await user.type(within(form).getByLabelText('Password'), 'short');
    expect(within(form).getByRole('button', { name: 'Create user' })).toBeDisabled();
  });

  it("keeps the dialog open and shows the server's reason when the email is taken", async () => {
    const user = userEvent.setup();
    const state = mockUsersApi();
    server.use(
      http.post(`${API}/admin/users`, () => HttpResponse.json({ error: 'An account with this email already exists' }, { status: 409 }))
    );
    renderUsers();
    await screen.findByText('Chidi Nwosu');

    await user.click(screen.getByRole('button', { name: '+ Add user' }));
    const form = dialog('Add a user');
    await user.type(within(form).getByLabelText('Name'), 'Copy Cat');
    await user.type(within(form).getByLabelText('Email'), 'driver@example.com');
    await user.type(within(form).getByLabelText('Password'), 'longenough');
    await user.click(within(form).getByRole('button', { name: 'Create user' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('An account with this email already exists');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(state.requests.create).toBeUndefined();
  });
});

describe('editing a user', () => {
  it('opens pre-filled, saves the changes, and updates the row', async () => {
    const user = userEvent.setup();
    const state = mockUsersApi();
    renderUsers();
    await screen.findByText('Chidi Nwosu');

    await user.click(screen.getByRole('button', { name: 'Edit Chidi Nwosu' }));
    const form = dialog('Edit Chidi Nwosu');
    expect(within(form).getByLabelText('Name')).toHaveValue('Chidi Nwosu');
    expect(within(form).getByLabelText('Email')).toHaveValue('driver@example.com');
    expect(within(form).getByLabelText('Role')).toHaveValue('driver');
    expect(within(form).queryByLabelText('Password')).not.toBeInTheDocument(); // passwords are reset, not edited

    await user.clear(within(form).getByLabelText('Name'));
    await user.type(within(form).getByLabelText('Name'), 'Chidi N. Nwosu');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await within(usersTable()).findByText('Chidi N. Nwosu')).toBeInTheDocument();
    expect(state.requests.update).toEqual({ id: 2, name: 'Chidi N. Nwosu', email: 'driver@example.com', role: 'driver' });
    expect(screen.getByRole('status')).toHaveTextContent('Saved changes to Chidi N. Nwosu.');
  });

  it('locks the admin\'s own role', async () => {
    const user = userEvent.setup();
    mockUsersApi();
    renderUsers();
    await screen.findByText('Chidi Nwosu');

    await user.click(screen.getByRole('button', { name: `Edit ${admin.name}` }));

    expect(within(dialog(`Edit ${admin.name}`)).getByLabelText('Role')).toBeDisabled();
  });
});

describe('resetting a password', () => {
  it('generates a temporary password, shows it once, and can copy it', async () => {
    const user = userEvent.setup();
    const state = mockUsersApi();
    renderUsers();
    await screen.findByText('Chidi Nwosu');

    await user.click(screen.getByRole('button', { name: 'Reset password for Chidi Nwosu' }));
    await user.click(within(dialog('Reset password for Chidi Nwosu?')).getByRole('button', { name: 'Reset password' }));

    const secret = await screen.findByRole('dialog', { name: 'Temporary password for Chidi Nwosu' });
    expect(within(secret).getByLabelText('Temporary password')).toHaveValue('Tmp9Xk2mQz4R');
    expect(state.requests.reset).toEqual({ id: 2, body: {} });

    await user.click(within(secret).getByRole('button', { name: 'Copy' }));
    expect(await within(secret).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe('Tmp9Xk2mQz4R');

    await user.click(within(secret).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Gone for good: reopening the flow doesn't show the old one.
    expect(screen.queryByDisplayValue('Tmp9Xk2mQz4R')).not.toBeInTheDocument();
  });

  it('sets a password the admin typed, and never displays it back', async () => {
    const user = userEvent.setup();
    const state = mockUsersApi();
    renderUsers();
    await screen.findByText('Chidi Nwosu');

    await user.click(screen.getByRole('button', { name: 'Reset password for Chidi Nwosu' }));
    const form = dialog('Reset password for Chidi Nwosu?');
    const confirm = within(form).getByRole('button', { name: 'Reset password' });
    await user.type(within(form).getByLabelText('New password (optional)'), 'short');
    expect(confirm).toBeDisabled(); // typed, but too short
    await user.clear(within(form).getByLabelText('New password (optional)'));
    await user.type(within(form).getByLabelText('New password (optional)'), 'chosen-by-admin');
    await user.click(confirm);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Password updated for Chidi Nwosu.'));
    expect(state.requests.reset).toEqual({ id: 2, body: { password: 'chosen-by-admin' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('chosen-by-admin')).not.toBeInTheDocument();
  });

  it('offers no reset on the admin\'s own row', async () => {
    mockUsersApi();
    renderUsers();
    await screen.findByText('Chidi Nwosu');

    expect(within(rowFor(admin.name)).queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument();
  });
});
