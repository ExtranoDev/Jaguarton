import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import AdminDashboardPage from '../src/pages/AdminDashboardPage.jsx';
import OperatorDashboardPage from '../src/pages/OperatorDashboardPage.jsx';
import { API, server, signInAs } from './server.js';

vi.mock('../src/components/operator/LocationPicker.jsx', () => ({ default: () => <div /> }));

const admin = { id: 1, name: 'Ifeoma Balogun', email: 'admin@example.com', role: 'admin', is_active: true };
const operator = { id: 3, name: 'Adaeze Okafor', email: 'operator@example.com', role: 'operator', is_active: true };

const entry = (id, overrides = {}) => ({
  id,
  created_at: '2026-09-24T13:05:00.000Z', // 14:05 in Lagos
  action: 'user.suspend',
  category: 'admin',
  actor: { id: 1, role: 'admin', name: 'Ifeoma Balogun', email: 'admin@example.com' },
  target: { type: 'user', id: 2, name: 'Chidi Nwosu', email: 'driver@example.com' },
  reason: 'Chargeback fraud',
  changes: { is_active: { from: true, to: false } },
  details: null,
  ip: '203.0.113.7',
  ...overrides,
});

function renderAdmin(tab) {
  return render(
    <MemoryRouter initialEntries={[`/admin?tab=${tab}`]}>
      <AuthProvider>
        <AdminDashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('admin audit log', () => {
  function mockAudit(total = 120) {
    const requests = [];
    signInAs(admin);
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: admin })),
      http.get(`${API}/admin/audit-log`, ({ request }) => {
        const params = Object.fromEntries(new URL(request.url).searchParams);
        requests.push(params);
        const page = Number(params.page || 1);
        const count = Math.max(0, Math.min(50, total - (page - 1) * 50));
        return HttpResponse.json({
          entries: Array.from({ length: count }, (_, i) => entry((page - 1) * 50 + i + 1)),
          total,
          page,
          pageSize: 50,
          actions: ['booking.cancel', 'user.suspend'],
        });
      })
    );
    return requests;
  }

  it('shows each entry with the year, the Lagos time, who, what, the reason and the change', async () => {
    mockAudit(1);
    renderAdmin('audit');

    const table = await screen.findByRole('table', { name: 'Audit log' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent(/24 Sept? 2026, 14:05/); // ICU versions differ on Sep/Sept
    expect(row).toHaveTextContent('Ifeoma Balogun');
    expect(row).toHaveTextContent('Suspended user');
    expect(row).toHaveTextContent('Chidi Nwosu');
    expect(row).toHaveTextContent('Reason: Chargeback fraud');
    expect(row).toHaveTextContent('Active: yes → no');
    expect(row).toHaveTextContent('IP 203.0.113.7');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–1 of 1 entries');
  });

  it('pages through everything (no cap) and sends the filters', async () => {
    const user = userEvent.setup();
    const requests = mockAudit(120);
    renderAdmin('audit');

    const count = () => screen.getByRole('status');
    await waitFor(() => expect(count()).toHaveTextContent('Showing 1–50 of 120 entries, newest first'));
    await user.click(screen.getAllByRole('button', { name: 'Older →' })[0]);
    await waitFor(() => expect(count()).toHaveTextContent('Showing 51–100 of 120 entries, newest first'));
    await user.click(screen.getAllByRole('button', { name: 'Older →' })[0]);
    await waitFor(() => expect(count()).toHaveTextContent('Showing 101–120 of 120 entries, newest first'));
    expect(screen.getAllByRole('button', { name: 'Older →' })[0]).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Kind'), 'booking');
    await user.selectOptions(screen.getByLabelText('Action'), 'booking.cancel');
    await user.type(screen.getByLabelText('Who'), 'ifeoma');
    await user.type(screen.getByLabelText('Target'), 'EVB-FF6');
    await user.type(screen.getByLabelText('From'), '2026-09-01');
    await user.type(screen.getByLabelText('To'), '2026-09-24');

    await waitFor(() =>
      expect(requests.at(-1)).toEqual({
        actor: 'ifeoma',
        action: 'booking.cancel',
        category: 'booking',
        target: 'EVB-FF6',
        from: '2026-09-01',
        to: '2026-09-24',
        page: '1', // a new filter starts again at the first page
        pageSize: '50',
      })
    );

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(requests.at(-1)).toEqual({ page: '1', pageSize: '50' }));
  }, 20000); // three 50-row pages and six filters: slow when the whole suite runs in parallel
});

describe('reasons in admin dialogs', () => {
  it('asks for a reason only when an edit changes the role, and sends it', async () => {
    const user = userEvent.setup();
    const sent = [];
    const driver = { id: 2, name: 'Chidi Nwosu', email: 'driver@example.com', role: 'driver', is_active: true, created_at: '2026-09-02T09:00:00.000Z' };
    signInAs(admin);
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: admin })),
      http.get(`${API}/admin/users`, () => HttpResponse.json({ users: [driver] })),
      http.put(`${API}/admin/users/:id`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ user: driver });
      })
    );
    renderAdmin('users');

    await user.click(await screen.findByRole('button', { name: 'Edit Chidi Nwosu' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Chidi Nwosu' });
    expect(within(dialog).queryByLabelText('Reason for changing the role')).not.toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText('Role'), 'operator');
    expect(within(dialog).getByText(/signs them out everywhere/)).toBeInTheDocument();
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason for changing the role'), 'Runs the new Ikeja site');
    await user.click(save);

    await waitFor(() =>
      expect(sent).toEqual([{ name: 'Chidi Nwosu', email: 'driver@example.com', role: 'operator', reason: 'Runs the new Ikeja site' }])
    );
  });

  it('needs a reason to deactivate a station', async () => {
    const user = userEvent.setup();
    const sent = [];
    signInAs(admin);
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: admin })),
      http.get(`${API}/admin/stations`, () =>
        HttpResponse.json({
          stations: [{ id: 1, name: 'Lekki Hub', address: 'Lekki', is_active: true, owner_name: 'Ada', owner_email: 'a@x.dev', chargers: [] }],
        })
      ),
      http.patch(`${API}/admin/stations/:id`, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ station: {} });
      })
    );
    renderAdmin('stations');

    await user.click(await screen.findByRole('button', { name: 'Deactivate Lekki Hub' }));
    const dialog = screen.getByRole('dialog', { name: 'Deactivate Lekki Hub?' });
    expect(within(dialog).getByRole('button', { name: 'Deactivate' })).toBeDisabled();
    expect(within(dialog).getByLabelText('Reason for deactivating')).toHaveAccessibleDescription(
      'At least 5 characters. It is kept in the audit log.'
    );
    await user.type(within(dialog).getByLabelText('Reason for deactivating'), 'Flooded after the storm');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(sent).toEqual([{ isActive: false, reason: 'Flooded after the storm' }]));
  });
});

describe('operator station history', () => {
  it("shows what happened at the station, with the driver's email masked", async () => {
    const user = userEvent.setup();
    const requests = [];
    signInAs(operator);
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: operator })),
      http.get(`${API}/operator/stations`, () =>
        HttpResponse.json({ stations: [{ id: 5, owner_id: 3, name: 'Lekki Hub', address: 'Lekki', is_active: true, chargers: [] }] })
      ),
      http.get(`${API}/operator/history`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams));
        return HttpResponse.json({
          total: 2,
          page: 1,
          pageSize: 50,
          entries: [
            entry(9, {
              action: 'booking.cancel',
              category: 'booking',
              actor: { id: null, role: 'admin', name: 'EChargeFind admin', email: null },
              target: { type: 'booking', id: 4, name: 'EVB-FF6XR2', email: 'c***@example.com' },
              reason: 'Site closed for repairs',
              changes: null,
              ip: undefined,
            }),
            entry(8, {
              action: 'booking.create',
              category: 'booking',
              actor: { id: null, role: 'driver', name: 'Chidi Nwosu', email: 'c***@example.com' },
              target: { type: 'booking', id: 4, name: 'EVB-FF6XR2', email: 'c***@example.com' },
              reason: null,
              changes: null,
              ip: undefined,
            }),
          ],
        });
      })
    );
    render(
      <MemoryRouter>
        <AuthProvider>
          <OperatorDashboardPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('tab', { name: 'History' }));
    const table = await screen.findByRole('table', { name: 'Station history' });
    const [, cancelled, booked] = within(table).getAllByRole('row');
    expect(cancelled).toHaveTextContent('Cancelled booking');
    expect(cancelled).toHaveTextContent('Reason: Site closed for repairs');
    expect(cancelled).toHaveTextContent('EChargeFind admin');
    expect(booked).toHaveTextContent('Chidi Nwosu');
    expect(booked).toHaveTextContent('c***@example.com');
    expect(requests).toEqual([{ stationId: '5', page: '1' }]);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–2 of 2 events');
  });
});
