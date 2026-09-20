import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import AdminDashboardPage from '../src/pages/AdminDashboardPage.jsx';
import { API, server, signInAs } from './server.js';

const admin = { id: 1, name: 'Ifeoma Balogun', email: 'admin@example.com', role: 'admin', is_active: true };

const isoDaysFromNow = (days, hour) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

// An in-memory stand-in for the admin endpoints that records what the UI sends.
function mockAdminApi() {
  const state = {
    users: [
      { id: 1, name: admin.name, email: admin.email, role: 'admin', is_active: true, created_at: '2026-09-01T09:00:00.000Z' },
      { id: 2, name: 'Chidi Nwosu', email: 'driver@example.com', role: 'driver', is_active: true, created_at: '2026-09-02T09:00:00.000Z' },
      { id: 3, name: 'Adaeze Okafor', email: 'operator@example.com', role: 'operator', is_active: true, created_at: '2026-09-03T09:00:00.000Z' },
    ],
    bookings: [
      {
        id: 7,
        booking_reference: 'EVB-FF6XR2',
        driver_name: 'Chidi Nwosu',
        driver_email: 'driver@example.com',
        station_name: 'Lekki Phase 1 Charging Hub',
        connector_type: 'CCS2_DC',
        power_kw: 100,
        start_time: isoDaysFromNow(1, 10),
        end_time: isoDaysFromNow(1, 11),
        price_at_booking: 235,
        status: 'confirmed',
      },
    ],
    requests: {},
  };
  const find = (list, id) => list.find((item) => item.id === Number(id));

  signInAs(admin);
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ user: admin })),
    http.get(`${API}/admin/users`, () => HttpResponse.json({ users: state.users })),
    http.patch(`${API}/admin/users/:id`, async ({ request, params }) => {
      const body = await request.json();
      state.requests.user = { id: Number(params.id), ...body };
      const user = find(state.users, params.id);
      user.is_active = body.isActive;
      return HttpResponse.json({ user });
    }),
    http.get(`${API}/admin/stations`, () => HttpResponse.json({ stations: [{ id: 1, name: 'Lekki Phase 1 Charging Hub', chargers: [] }] })),
    http.get(`${API}/admin/bookings`, () => HttpResponse.json({ bookings: state.bookings })),
    http.patch(`${API}/admin/bookings/:id/cancel`, async ({ request, params }) => {
      const body = await request.json();
      state.requests.cancel = { id: Number(params.id), ...body };
      const booking = find(state.bookings, params.id);
      booking.status = 'cancelled';
      return HttpResponse.json({ booking });
    })
  );
  return state;
}

function renderAdmin(tab) {
  return render(
    <MemoryRouter initialEntries={[tab ? `/admin?tab=${tab}` : '/admin']}>
      <AuthProvider>
        <AdminDashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

const rowFor = (text) => screen.getByText(text).closest('tr');

describe('admin users', () => {
  it('suspends a user after confirming, then reactivates them', async () => {
    const user = userEvent.setup();
    const state = mockAdminApi();
    renderAdmin('users');

    expect(await screen.findByText('Chidi Nwosu')).toBeInTheDocument();
    expect(within(rowFor('Chidi Nwosu')).getByText('Active')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Suspend Chidi Nwosu' }));

    // Nothing happens until the dialog is confirmed.
    const dialog = screen.getByRole('dialog', { name: 'Suspend Chidi Nwosu?' });
    expect(state.requests.user).toBeUndefined();
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));

    expect(await within(rowFor('Chidi Nwosu')).findByText('Suspended')).toBeInTheDocument();
    expect(state.requests.user).toEqual({ id: 2, isActive: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reactivate Chidi Nwosu' }));

    expect(await within(rowFor('Chidi Nwosu')).findByText('Active')).toBeInTheDocument();
    expect(state.requests.user).toEqual({ id: 2, isActive: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // reactivating needs no confirmation
  });

  it('does nothing when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    const state = mockAdminApi();
    renderAdmin('users');
    await screen.findByText('Chidi Nwosu');

    await user.click(screen.getByRole('button', { name: 'Suspend Chidi Nwosu' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Go back' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(state.requests.user).toBeUndefined();
    expect(within(rowFor('Chidi Nwosu')).getByText('Active')).toBeInTheDocument();
  });

  it("offers no suspend button on the admin's own row", async () => {
    mockAdminApi();
    renderAdmin('users');

    await screen.findByText('Chidi Nwosu');
    // The navbar shows the admin's name too, so look inside the table.
    const ownRow = within(screen.getByRole('table', { name: 'Users' })).getByText(admin.name).closest('tr');
    expect(within(ownRow).queryByRole('button')).not.toBeInTheDocument();
    expect(within(ownRow).getByText('This is you')).toBeInTheDocument();
  });

  it("shows the server's reason inside the dialog when a suspension is refused", async () => {
    const user = userEvent.setup();
    const state = mockAdminApi();
    server.use(
      http.patch(`${API}/admin/users/:id`, () =>
        HttpResponse.json({ error: 'Cannot suspend the last active admin' }, { status: 409 })
      )
    );
    renderAdmin('users');
    await screen.findByText('Chidi Nwosu');

    await user.click(screen.getByRole('button', { name: 'Suspend Adaeze Okafor' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot suspend the last active admin');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(rowFor('Adaeze Okafor')).getByText('Active')).toBeInTheDocument();
    expect(state.requests.user).toBeUndefined();
  });
});

describe('admin bookings', () => {
  it('cancels a booking only with a reason, and sends that reason', async () => {
    const user = userEvent.setup();
    const state = mockAdminApi();
    renderAdmin('bookings');

    expect(await screen.findByText('EVB-FF6XR2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel booking EVB-FF6XR2' }));

    const dialog = screen.getByRole('dialog', { name: 'Cancel booking EVB-FF6XR2?' });
    const confirm = within(dialog).getByRole('button', { name: 'Cancel booking' });
    expect(confirm).toBeDisabled(); // a reason is required

    await user.type(within(dialog).getByLabelText('Reason for cancelling'), '   ');
    expect(confirm).toBeDisabled(); // whitespace is not a reason

    await user.type(within(dialog).getByLabelText('Reason for cancelling'), 'Charger damaged in the storm');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(await within(rowFor('EVB-FF6XR2')).findByText('Cancelled')).toBeInTheDocument();
    expect(state.requests.cancel).toEqual({ id: 7, reason: 'Charger damaged in the storm' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // A cancelled booking can't be cancelled again.
    expect(screen.queryByRole('button', { name: 'Cancel booking EVB-FF6XR2' })).not.toBeInTheDocument();
  });

  it('closes the dialog on Escape without cancelling', async () => {
    const user = userEvent.setup();
    const state = mockAdminApi();
    renderAdmin('bookings');
    await screen.findByText('EVB-FF6XR2');

    await user.click(screen.getByRole('button', { name: 'Cancel booking EVB-FF6XR2' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(state.requests.cancel).toBeUndefined();
    expect(within(rowFor('EVB-FF6XR2')).getByText('Confirmed')).toBeInTheDocument();
  });
});

describe('admin page', () => {
  it('opens on the overview and switches tabs', async () => {
    const user = userEvent.setup();
    mockAdminApi();
    server.use(
      http.get(`${API}/admin/overview`, () =>
        HttpResponse.json({
          overview: {
            users: { total: 3, drivers: 1, operators: 1, admins: 1, suspended: 0 },
            stations: { total: 13, active: 12, inactive: 1 },
            chargers: { total: 32, online: 28, offline: 3, unavailable: 1 },
            bookings: { total: 4, confirmed: 3, cancelled: 1, upcoming: 3 },
            utilisation: {
              from: '2026-09-20',
              to: '2026-09-26',
              booked: 3,
              open: 9,
              rate: 25,
              days: ['20', '21', '22', '23', '24', '25', '26'].map((d, i) => ({
                date: `2026-09-${d}`,
                booked: i === 1 ? 3 : 0,
                open: i === 1 ? 9 : 0,
                rate: i === 1 ? 25 : null,
              })),
            },
          },
        })
      )
    );
    renderAdmin();

    expect(await screen.findByText('Active stations')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Next 7 days: 3 booked of 12 bookable slots (25%)')).toBeInTheDocument();
    expect(screen.queryByText(/revenue/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Users' }));

    expect(await screen.findByText('Chidi Nwosu')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
  });
});
