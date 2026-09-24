import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import LoginPage from '../src/pages/LoginPage.jsx';
import SignupPage from '../src/pages/SignupPage.jsx';

const renderPage = (page) =>
  render(
    <MemoryRouter>
      <AuthProvider>{page}</AuthProvider>
    </MemoryRouter>
  );

describe('log in and sign up pages', () => {
  it('have one h1 inside the main landmark, and state the real booking hours', () => {
    renderPage(<LoginPage />);

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByText(/08:00–20:00/).length).toBeGreaterThan(0);
    expect(screen.queryByText('24/7')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows which account type is chosen with aria-pressed', async () => {
    const user = userEvent.setup();
    renderPage(<SignupPage />);

    const group = screen.getByRole('group', { name: 'I am a' });
    const driver = within(group).getByRole('button', { name: 'Driver' });
    const operator = within(group).getByRole('button', { name: 'Operator' });
    expect(driver).toHaveAttribute('aria-pressed', 'true');
    expect(operator).toHaveAttribute('aria-pressed', 'false');

    await user.click(operator);
    expect(driver).toHaveAttribute('aria-pressed', 'false');
    expect(operator).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument();
  });
});
