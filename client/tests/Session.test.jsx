import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import client, { SERVER_REACHABLE, SERVER_UNREACHABLE } from '../src/api/client.js';
import ServerStatusBanner from '../src/components/ServerStatusBanner.jsx';
import { AuthProvider, useAuth } from '../src/context/AuthContext.jsx';
import LoginPage from '../src/pages/LoginPage.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import { API, server, signInAs } from './server.js';

const driver = { id: 2, name: 'Chidi Nwosu', email: 'driver@example.com', role: 'driver', is_active: true };

// A protected page that makes one authenticated call as soon as it opens.
function Bookings() {
  const { user } = useAuth();
  client.get('/bookings/me').catch(() => {});
  return <h1>Bookings for {user.name}</h1>;
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/bookings']}>
      <AuthProvider>
        <ServerStatusBanner />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/bookings"
            element={
              <ProtectedRoute>
                <Bookings />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('a session that ends while you are using the app', () => {
  it('signs a suspended user out and tells them why', async () => {
    signInAs(driver);
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: driver })),
      http.get(`${API}/bookings/me`, () => HttpResponse.json({ error: 'This account has been suspended' }, { status: 403 }))
    );
    renderApp();

    expect(await screen.findByRole('status')).toHaveTextContent(/your account has been suspended/i);
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    expect(localStorage.getItem('echargefind_token')).toBeNull();
  });

  it('signs out an expired session with a plain message', async () => {
    signInAs(driver);
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: driver })),
      http.get(`${API}/bookings/me`, () => HttpResponse.json({ error: 'Invalid or expired token' }, { status: 401 }))
    );
    renderApp();

    expect(await screen.findByRole('status')).toHaveTextContent(/session has ended/i);
    expect(localStorage.getItem('echargefind_token')).toBeNull();
  });

  it('leaves the user signed in for an ordinary error, like a 403 that is not a suspension', async () => {
    signInAs(driver);
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: driver })),
      http.get(`${API}/bookings/me`, () => HttpResponse.json({ error: 'Requires role: operator' }, { status: 403 }))
    );
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Bookings for Chidi Nwosu' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(localStorage.getItem('echargefind_token')).toBeTruthy();
  });

  it('does not treat a failed login as a session ending', async () => {
    const user = userEvent.setup();
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.json({ error: 'Invalid email or password' }, { status: 401 })));
    localStorage.setItem('echargefind_token', 'stale-token'); // an old token is still in storage
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json({ error: 'expired' }, { status: 401 })));
    renderApp();
    await screen.findByLabelText('Email address');
    await user.type(screen.getByLabelText('Email address'), 'driver@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    // The real reason, not "your session has ended".
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});

describe('login page', () => {
  it('starts empty and does not advertise a password', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Email address')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByText(/password123/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/demo accounts/i)).not.toBeInTheDocument();
  });

  it("says the server can't be reached, rather than blaming the password", async () => {
    const user = userEvent.setup();
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.error()));
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await user.type(await screen.findByLabelText('Email address'), 'driver@example.com');
    await user.type(screen.getByLabelText('Password'), 'whatever-it-is');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/can't reach the server/i);
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });
});

describe('server waking up', () => {
  it('retries a read that hit a sleeping server and returns the data once it answers', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/stations`, () => {
        calls += 1;
        return calls < 3 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ stations: [{ id: 1 }] });
      })
    );

    const { data } = await client.get('/stations');

    expect(data.stations).toHaveLength(1);
    expect(calls).toBe(3); // the original request plus two retries
  });

  it('gives up after the retries, and never retries a write', async () => {
    let gets = 0;
    let posts = 0;
    server.use(
      http.get(`${API}/stations`, () => {
        gets += 1;
        return new HttpResponse(null, { status: 503 });
      }),
      http.post(`${API}/bookings`, () => {
        posts += 1;
        return new HttpResponse(null, { status: 503 });
      })
    );

    await expect(client.get('/stations')).rejects.toMatchObject({ response: { status: 503 } });
    await expect(client.post('/bookings', { slotId: 1 })).rejects.toMatchObject({ response: { status: 503 } });

    expect(gets).toBe(3);
    expect(posts).toBe(1); // repeating a booking could book twice
  });

  it('shows a banner while the server is unreachable and hides it once it answers', async () => {
    render(<ServerStatusBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event(SERVER_UNREACHABLE));
    });
    expect(screen.getByRole('status')).toHaveTextContent(/waking up/i);

    act(() => {
      window.dispatchEvent(new Event(SERVER_REACHABLE));
    });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
