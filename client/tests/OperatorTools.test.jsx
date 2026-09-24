import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import AdminDashboardPage from '../src/pages/AdminDashboardPage.jsx';
import OperatorDashboardPage from '../src/pages/OperatorDashboardPage.jsx';
import { API, server, signInAs } from './server.js';

vi.mock('../src/components/operator/LocationPicker.jsx', () => ({ default: () => <div data-testid="location-picker" /> }));

const operator = { id: 3, name: 'Adaeze Okafor', email: 'operator@example.com', role: 'operator', is_active: true };
const admin = { id: 1, name: 'Ifeoma Balogun', email: 'admin@example.com', role: 'admin', is_active: true };

const inHours = (hours) => new Date(Date.now() + hours * 3600 * 1000).toISOString();
const charger = (id, overrides = {}) => ({
  id,
  station_id: 5,
  connector_type: 'CCS2_DC',
  power_kw: 60,
  price_per_kwh: 200,
  status: 'online',
  archived: false,
  ...overrides,
});
const station = (overrides = {}) => ({
  id: 5,
  owner_id: 3,
  name: 'Lekki Hub',
  address: '1 Admiralty Way, Lekki',
  lat: 6.44,
  lng: 3.47,
  is_active: true,
  approval_status: 'approved',
  review_note: null,
  archived: false,
  chargers: [charger(10)],
  ...overrides,
});

// An in-memory operator API that records what the UI sends.
function mockOperator(initial = station()) {
  const state = { station: initial, sent: [], statusCalls: [] };
  signInAs(operator);
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ user: operator })),
    http.get(`${API}/operator/stations`, () => HttpResponse.json({ stations: [state.station] })),
    http.put(`${API}/stations/:id`, async ({ request }) => {
      const body = await request.json();
      state.sent.push(['edit', body]);
      state.station = { ...state.station, ...body, approval_status: state.station.approval_status === 'rejected' ? 'pending' : state.station.approval_status };
      return HttpResponse.json({ station: state.station });
    }),
    http.patch(`${API}/stations/:id/archive`, async ({ request }) => {
      const body = await request.json();
      state.sent.push(['archive', body]);
      if (state.refuseArchive) {
        return HttpResponse.json({ error: 'This station has 1 upcoming booking. Cancel it before archiving the station', code: 'HAS_UPCOMING_BOOKINGS', upcomingBookings: 1 }, { status: 409 });
      }
      state.station = { ...state.station, archived: body.archived };
      return HttpResponse.json({ station: state.station });
    }),
    http.patch(`${API}/chargers/:id/status`, async ({ request }) => {
      const body = await request.json();
      state.statusCalls.push(body);
      if (!body.confirm && body.status !== 'online') {
        return HttpResponse.json({ error: 'This charger has 2 upcoming bookings.', code: 'CONFIRM_REQUIRED', upcomingBookings: 2 }, { status: 409 });
      }
      state.station = { ...state.station, chargers: [charger(10, { status: body.status })] };
      return HttpResponse.json({ charger: state.station.chargers[0] });
    }),
    http.get(`${API}/chargers/:id/slots`, () =>
      HttpResponse.json({
        slots: [
          { id: 71, charger_id: 10, start_time: inHours(30), end_time: inHours(31), status: 'available' },
          { id: 72, charger_id: 10, start_time: inHours(31), end_time: inHours(32), status: 'booked' },
        ],
      })
    ),
    http.patch(`${API}/slots/:id`, async ({ request, params }) => {
      const body = await request.json();
      state.sent.push(['slot', Number(params.id), body]);
      return HttpResponse.json({ slot: { id: Number(params.id), charger_id: 10, start_time: inHours(30), end_time: inHours(31), status: body.status } });
    }),
    http.get(`${API}/operator/bookings`, () =>
      HttpResponse.json({
        bookings: [
          {
            id: 44,
            booking_reference: 'EVB-AB2CD3',
            driver_name: 'Chidi Nwosu',
            driver_email: 'driver@example.com',
            connector_type: 'CCS2_DC',
            power_kw: 60,
            start_time: inHours(26),
            end_time: inHours(27),
            price_at_booking: 200,
            status: state.cancelled ? 'cancelled' : 'confirmed',
          },
        ],
      })
    ),
    http.patch(`${API}/operator/bookings/:id/cancel`, async ({ request, params }) => {
      state.sent.push(['cancel', Number(params.id), await request.json()]);
      state.cancelled = true;
      return HttpResponse.json({ booking: {} });
    })
  );
  render(
    <MemoryRouter>
      <AuthProvider>
        <OperatorDashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
  return state;
}

describe('operator: approval states', () => {
  it('shows a pending station as pending, with a note that drivers cannot see it yet', async () => {
    mockOperator(station({ approval_status: 'pending' }));
    expect(await screen.findByText('Waiting for an admin to approve this station.', { exact: false })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Your stations' })).getByText('Pending approval')).toBeInTheDocument();
  });

  it("shows why a station was rejected, and editing it sends the changes (which resubmits it)", async () => {
    const user = userEvent.setup();
    const state = mockOperator(station({ approval_status: 'rejected', review_note: 'The pin is in the lagoon' }));

    expect(await screen.findByText(/The pin is in the lagoon/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit station' }));
    expect(screen.getByText('Saving sends it back to an admin for approval.')).toBeInTheDocument();
    const address = screen.getByLabelText('Address');
    expect(address).toHaveValue('1 Admiralty Way, Lekki');
    await user.clear(address);
    await user.type(address, '2 Admiralty Way, Lekki');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(state.sent).toEqual([['edit', { name: 'Lekki Hub', address: '2 Admiralty Way, Lekki', lat: 6.44, lng: 3.47 }]]));
    expect(await screen.findByText('Waiting for an admin to approve this station.', { exact: false })).toBeInTheDocument();
  });
});

describe('operator: charger tools', () => {
  it('asks before taking a charger with upcoming bookings offline, then confirms', async () => {
    const user = userEvent.setup();
    const state = mockOperator();

    const group = await screen.findByRole('group', { name: 'Status for charger 10' });
    await user.click(within(group).getByRole('button', { name: 'Offline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Set charger #10 offline?' });
    expect(dialog).toHaveTextContent('It has 2 upcoming bookings.');
    await user.click(within(dialog).getByRole('button', { name: 'Set offline' }));

    await waitFor(() => expect(state.statusCalls).toEqual([{ status: 'offline' }, { status: 'offline', confirm: true }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('blocks a slot; booked slots cannot be changed', async () => {
    const user = userEvent.setup();
    const state = mockOperator();

    await user.click(await screen.findByRole('button', { name: 'Show slots for charger 10' }));
    const list = await screen.findByRole('list', { name: 'Slots for charger 10' });
    const [open, booked] = within(list).getAllByRole('listitem');
    expect(within(booked).getByRole('button', { name: /Booked/ })).toBeDisabled();
    await user.click(within(open).getByRole('button', { name: /^Block/ }));

    await waitFor(() => expect(state.sent).toEqual([['slot', 71, { status: 'blocked' }]]));
    expect(await within(open).findByRole('button', { name: /^Unblock/ })).toBeInTheDocument();
  });

  it("archives a station after confirming, and shows why when it can't", async () => {
    const user = userEvent.setup();
    const state = mockOperator();
    state.refuseArchive = true;

    await user.click(await screen.findByRole('button', { name: 'Archive station' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive Lekki Hub?' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cancel it before archiving');

    state.refuseArchive = false;
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText(/Archived: hidden from drivers/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore station' }));
    await waitFor(() => expect(state.sent.map(([kind, body]) => [kind, body.archived])).toEqual([
      ['archive', true],
      ['archive', true],
      ['archive', false],
    ]));
  });

  it('cancels an upcoming booking with a reason', async () => {
    const user = userEvent.setup();
    const state = mockOperator();

    await user.click(await screen.findByRole('tab', { name: 'Bookings' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel booking EVB-AB2CD3' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel booking EVB-AB2CD3?' });
    const confirm = within(dialog).getByRole('button', { name: 'Cancel booking' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), 'Power cut on site');
    await user.click(confirm);

    await waitFor(() => expect(state.sent).toEqual([['cancel', 44, { reason: 'Power cut on site' }]]));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel booking EVB-AB2CD3' })).not.toBeInTheDocument();
  });
});

describe('admin: approving stations', () => {
  it('filters to pending stations, approves one, and needs a reason to reject', async () => {
    const user = userEvent.setup();
    const requests = [];
    const pending = { ...station({ id: 8, name: 'Queued Hub', approval_status: 'pending' }), owner_name: 'Adaeze Okafor', owner_email: 'operator@example.com', owner_active: true };
    signInAs(admin);
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: admin })),
      http.get(`${API}/admin/stations`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams));
        return HttpResponse.json({ stations: [pending] });
      }),
      http.patch(`${API}/admin/stations/:id/approval`, async ({ request }) => {
        requests.push(await request.json());
        return HttpResponse.json({ station: pending });
      })
    );
    render(
      <MemoryRouter initialEntries={['/admin?tab=stations']}>
        <AuthProvider>
          <AdminDashboardPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await screen.findByText('Queued Hub');
    await user.selectOptions(screen.getByLabelText('Filter stations'), 'pending');
    await waitFor(() => expect(requests).toContainEqual({ approval: 'pending' }));
    expect(within(screen.getByText('Queued Hub').closest('li')).getByText('Pending approval')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reject Queued Hub' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject Queued Hub?' });
    expect(within(dialog).getByRole('button', { name: 'Reject' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Go back' }));

    await user.click(screen.getByRole('button', { name: 'Approve Queued Hub' }));
    await waitFor(() => expect(requests).toContainEqual({ decision: 'approve' }));
  });
});
