import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import AccountPage from '../src/pages/AccountPage.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import { API, server, signInAs } from './server.js';

const driver = { id: 2, name: 'Chidi Nwosu', email: 'driver@example.com', role: 'driver', is_active: true };

function mockAccountApi() {
  const state = { requests: {}, user: { ...driver } };
  signInAs(driver);
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ user: state.user })),
    http.patch(`${API}/auth/me`, async ({ request }) => {
      const body = await request.json();
      state.requests.profile = body;
      state.user = { ...state.user, name: body.name };
      return HttpResponse.json({ user: state.user });
    }),
    http.post(`${API}/auth/change-password`, async ({ request }) => {
      const body = await request.json();
      state.requests.password = body;
      return HttpResponse.json({ message: 'Password updated' });
    })
  );
  return state;
}

function renderAccount() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        {/* As in the app: the route guard waits for the user to load. */}
        <ProtectedRoute>
          <AccountPage />
        </ProtectedRoute>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('account page', () => {
  it('shows who you are, and saves a new name (which the navbar picks up)', async () => {
    const user = userEvent.setup();
    const state = mockAccountApi();
    renderAccount();

    const name = await screen.findByLabelText('Name');
    expect(name).toHaveValue('Chidi Nwosu');
    expect(screen.getByText('driver@example.com')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save name' });
    expect(save).toBeDisabled(); // nothing changed yet

    await user.clear(name);
    await user.type(name, 'Chidi N. Nwosu');
    await user.click(save);

    expect(await screen.findByText('Your name has been updated.')).toBeInTheDocument();
    expect(state.requests.profile).toEqual({ name: 'Chidi N. Nwosu' });
    expect(screen.getAllByText('Chidi N. Nwosu').length).toBeGreaterThan(0); // navbar shows it too
  });

  it('changes the password and clears the form', async () => {
    const user = userEvent.setup();
    const state = mockAccountApi();
    renderAccount();
    await screen.findByLabelText('Name');

    const submit = screen.getByRole('button', { name: 'Change password' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Current password'), 'old-password');
    await user.type(screen.getByLabelText('New password'), 'brand-new-pass');
    await user.type(screen.getByLabelText('Confirm new password'), 'brand-new-pass');
    await user.click(submit);

    expect(await screen.findByText('Your password has been changed.')).toBeInTheDocument();
    expect(state.requests.password).toEqual({ currentPassword: 'old-password', newPassword: 'brand-new-pass' });
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('catches a short password and a mismatch before asking the server', async () => {
    const user = userEvent.setup();
    const state = mockAccountApi();
    renderAccount();
    await screen.findByLabelText('Name');

    await user.type(screen.getByLabelText('Current password'), 'old-password');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters');

    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(state.requests.password).toBeUndefined();
  });

  it("shows the server's message for a wrong current password, and stays signed in", async () => {
    const user = userEvent.setup();
    mockAccountApi();
    server.use(
      http.post(`${API}/auth/change-password`, () =>
        HttpResponse.json({ error: 'Your current password is incorrect' }, { status: 400 })
      )
    );
    renderAccount();
    await screen.findByLabelText('Name');

    await user.type(screen.getByLabelText('Current password'), 'wrong-password');
    await user.type(screen.getByLabelText('New password'), 'brand-new-pass');
    await user.type(screen.getByLabelText('Confirm new password'), 'brand-new-pass');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is incorrect');
    expect(screen.getByLabelText('Name')).toBeInTheDocument(); // still on the page, still logged in
    expect(localStorage.getItem('echargefind_token')).toBeTruthy();
  });
});
