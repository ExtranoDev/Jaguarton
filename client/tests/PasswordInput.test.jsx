import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PasswordInput from '../src/components/PasswordInput.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import AccountPage from '../src/pages/AccountPage.jsx';
import LoginPage from '../src/pages/LoginPage.jsx';
import SignupPage from '../src/pages/SignupPage.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import { API, server, signInAs } from './server.js';

describe('PasswordInput', () => {
  it('starts hidden, and the eye button shows and hides the password', async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" defaultValue="hunter2-secret" />
      </>
    );
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveValue('hunter2-secret'); // same value, now readable

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  it('never submits the surrounding form, and keeps what was typed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" />
      </form>
    );

    await user.type(screen.getByLabelText('Password'), 'typed-value');
    await user.click(screen.getByRole('button', { name: 'Show password' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Password')).toHaveValue('typed-value');
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" />
      </>
    );

    await user.click(screen.getByLabelText('Password'));
    await user.tab(); // the eye button is the next stop
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    await user.keyboard(' ');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('passes props through to the input and names the button after the field', () => {
    render(
      <>
        <label htmlFor="pw">New password</label>
        <PasswordInput id="pw" label="new password" required minLength={8} autoComplete="new-password" className="custom" />
      </>
    );

    const field = screen.getByLabelText('New password');
    expect(field).toBeRequired();
    expect(field).toHaveAttribute('minlength', '8');
    expect(field).toHaveAttribute('autocomplete', 'new-password');
    expect(field).toHaveClass('custom');
    expect(screen.getByRole('button', { name: 'Show new password' })).toBeInTheDocument();
  });
});

describe('where it is used', () => {
  it('login and signup both have the eye', () => {
    const { unmount } = render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter>
        <AuthProvider>
          <SignupPage />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    // Signup asks for the same 8-character minimum as the API, and says so.
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('minLength', '8');
    expect(password).toHaveAccessibleDescription('At least 8 characters.');
  });

  it('the Account page has one eye per field, each with its own name', async () => {
    const user = userEvent.setup();
    const driver = { id: 2, name: 'Chidi Nwosu', email: 'driver@example.com', role: 'driver', is_active: true };
    signInAs(driver);
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ user: driver })));
    render(
      <MemoryRouter>
        <AuthProvider>
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByLabelText('Current password');

    for (const name of ['current password', 'new password', 'password confirmation']) {
      expect(screen.getByRole('button', { name: `Show ${name}` })).toBeInTheDocument();
    }
    // Revealing one leaves the others hidden.
    await user.click(screen.getByRole('button', { name: 'Show new password' }));
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'password');
  });
});
