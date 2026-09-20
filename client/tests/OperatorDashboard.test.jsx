import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import OperatorDashboardPage from '../src/pages/OperatorDashboardPage.jsx';
import { API, server, signInAs } from './server.js';

// Leaflet needs real layout to work; the map click itself is not what is under test here.
vi.mock('../src/components/operator/LocationPicker.jsx', () => ({
  default: () => <div data-testid="location-picker" />,
}));

const operator = { id: 1, name: 'Adaeze Okafor', email: 'operator@example.com', role: 'operator' };

function makeCharger(id, stationId, overrides = {}) {
  return {
    id,
    station_id: stationId,
    connector_type: 'CCS2_DC',
    power_kw: 100,
    price_per_kwh: 235,
    status: 'online',
    ...overrides,
  };
}

// An in-memory stand-in for the operator endpoints, recording what the UI sends.
function mockOperatorApi() {
  const state = {
    stations: [
      {
        id: 1,
        owner_id: 1,
        name: 'Lekki Phase 1 Charging Hub',
        address: 'Admiralty Way, Lekki Phase 1',
        lat: 6.44,
        lng: 3.47,
        chargers: [makeCharger(10, 1), makeCharger(11, 1, { connector_type: 'Type2_AC', power_kw: 22, price_per_kwh: 150 })],
      },
      { id: 2, owner_id: 1, name: 'Ikeja GRA Charge Station', address: 'Oduduwa Way', lat: 6.58, lng: 3.35, chargers: [] },
    ],
    requests: {},
  };
  const findCharger = (id) => state.stations.flatMap((s) => s.chargers).find((c) => c.id === Number(id));

  signInAs(operator);
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ user: operator })),
    http.get(`${API}/operator/stations`, () => HttpResponse.json({ stations: state.stations })),
    http.patch(`${API}/chargers/:id/status`, async ({ request, params }) => {
      const body = await request.json();
      state.requests.status = { id: Number(params.id), ...body };
      findCharger(params.id).status = body.status;
      return HttpResponse.json({ charger: findCharger(params.id) });
    }),
    http.put(`${API}/chargers/:id`, async ({ request, params }) => {
      const body = await request.json();
      state.requests.update = { id: Number(params.id), ...body };
      findCharger(params.id).price_per_kwh = body.pricePerKwh;
      return HttpResponse.json({ charger: findCharger(params.id) });
    }),
    http.post(`${API}/stations/:id/chargers`, async ({ request, params }) => {
      const body = await request.json();
      state.requests.addCharger = { stationId: Number(params.id), ...body };
      const charger = makeCharger(99, Number(params.id), {
        connector_type: body.connectorType,
        power_kw: body.powerKw,
        price_per_kwh: body.pricePerKwh,
      });
      state.stations.find((s) => s.id === Number(params.id)).chargers.push(charger);
      return HttpResponse.json({ charger }, { status: 201 });
    }),
    http.post(`${API}/stations`, async ({ request }) => {
      const body = await request.json();
      state.requests.createStation = body;
      const station = { id: 3, owner_id: 1, ...body, chargers: [] };
      state.stations.push(station);
      return HttpResponse.json({ station }, { status: 201 });
    }),
    http.post(`${API}/operator/slots/top-up`, async ({ request }) => {
      state.requests.topUp = await request.json();
      return HttpResponse.json({ chargers: 2, days: 7, created: 84 });
    }),
    http.get(`${API}/operator/bookings`, ({ request }) => {
      state.requests.bookingsStationId = new URL(request.url).searchParams.get('stationId');
      return HttpResponse.json({
        bookings: [
          {
            id: 1,
            booking_reference: 'EVB-FF6XR2',
            driver_name: 'Chidi Nwosu',
            driver_email: 'driver@example.com',
            connector_type: 'CCS2_DC',
            power_kw: 100,
            start_time: new Date(Date.now() + 86400000).toISOString(),
            end_time: new Date(Date.now() + 90000000).toISOString(),
            price_at_booking: 235,
            status: 'confirmed',
          },
        ],
      });
    })
  );
  return state;
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <OperatorDashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

const statusGroup = (chargerId) => screen.getByRole('group', { name: `Status for charger ${chargerId}` });

describe('operator dashboard', () => {
  it('lists the operator\'s stations with charger totals and opens the first one', async () => {
    mockOperatorApi();
    renderDashboard();

    expect(await screen.findByText('2 stations · 2 chargers')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Your stations' });
    expect(within(nav).getByText('Ikeja GRA Charge Station')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Lekki Phase 1 Charging Hub' })).toBeInTheDocument();
    expect(within(statusGroup(10)).getByRole('button', { name: 'Online' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('sets a charger Offline and reflects it', async () => {
    const user = userEvent.setup();
    const state = mockOperatorApi();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Lekki Phase 1 Charging Hub' });

    await user.click(within(statusGroup(10)).getByRole('button', { name: 'Offline' }));

    expect(await within(statusGroup(10)).findByRole('button', { name: 'Offline', pressed: true })).toBeInTheDocument();
    expect(state.requests.status).toEqual({ id: 10, status: 'offline' });
    expect(within(statusGroup(11)).getByRole('button', { name: 'Online' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('edits a charger price', async () => {
    const user = userEvent.setup();
    const state = mockOperatorApi();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Lekki Phase 1 Charging Hub' });

    await user.click(screen.getByRole('button', { name: 'Edit price for charger 10' }));
    const input = screen.getByLabelText('Price per kWh');
    await user.clear(input);
    await user.type(input, '275');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Edit price for charger 10' })).toHaveTextContent('₦275.00');
    expect(state.requests.update).toEqual({
      id: 10,
      connectorType: 'CCS2_DC',
      powerKw: 100,
      pricePerKwh: 275,
    });
  });

  it('adds a charger to a station', async () => {
    const user = userEvent.setup();
    const state = mockOperatorApi();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Lekki Phase 1 Charging Hub' });

    await user.click(screen.getByRole('button', { name: '+ Add Charger' }));
    await user.selectOptions(screen.getByLabelText('Connector'), 'CHAdeMO_DC');
    await user.type(screen.getByLabelText('Price (₦ per kWh)'), '210');
    await user.click(screen.getByRole('button', { name: 'Add charger' }));

    expect(await screen.findByRole('group', { name: 'Status for charger 99' })).toBeInTheDocument();
    expect(state.requests.addCharger).toEqual({
      stationId: 1,
      connectorType: 'CHAdeMO_DC',
      powerKw: 50,
      pricePerKwh: 210,
    });
    expect(screen.getByText('3 chargers', { exact: false })).toBeInTheDocument();
  });

  it('shows the station\'s bookings with driver names', async () => {
    const user = userEvent.setup();
    const state = mockOperatorApi();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Lekki Phase 1 Charging Hub' });

    await user.click(screen.getByRole('tab', { name: 'Bookings' }));

    const table = await screen.findByRole('table');
    expect(within(table).getByText('EVB-FF6XR2')).toBeInTheDocument();
    expect(within(table).getByText('Chidi Nwosu')).toBeInTheDocument();
    expect(within(table).getByText('driver@example.com')).toBeInTheDocument();
    expect(within(table).getByText('Confirmed')).toBeInTheDocument();
    expect(state.requests.bookingsStationId).toBe('1');
  });

  it('registers a new station and selects it', async () => {
    const user = userEvent.setup();
    const state = mockOperatorApi();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Lekki Phase 1 Charging Hub' });

    await user.click(screen.getByRole('button', { name: '+ Add Station' }));
    expect(screen.getByRole('button', { name: 'Create station' })).toBeDisabled();

    await user.type(screen.getByLabelText('Station name'), 'Yaba Tech Hub');
    await user.type(screen.getByLabelText('Address'), 'Herbert Macaulay Way, Yaba');
    await user.type(screen.getByLabelText('Latitude'), '6.5095');
    await user.type(screen.getByLabelText('Longitude'), '3.3711');
    await user.click(screen.getByRole('button', { name: 'Create station' }));

    expect(await screen.findByRole('heading', { name: 'Yaba Tech Hub' })).toBeInTheDocument();
    expect(state.requests.createStation).toEqual({
      name: 'Yaba Tech Hub',
      address: 'Herbert Macaulay Way, Yaba',
      lat: 6.5095,
      lng: 3.3711,
    });
    expect(screen.getByText(/no chargers yet/i, { selector: 'p' })).toBeInTheDocument();
  });

  it('generates slots for the next 7 days for the selected station', async () => {
    const user = userEvent.setup();
    const state = mockOperatorApi();
    renderDashboard();
    await screen.findByRole('heading', { name: 'Lekki Phase 1 Charging Hub' });

    await user.click(screen.getByRole('button', { name: /generate slots/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Added 84 new slots across 2 chargers.');
    expect(state.requests.topUp).toEqual({ days: 7, stationId: 1 });
  });

  it('shows an error when a status change is rejected', async () => {
    const user = userEvent.setup();
    mockOperatorApi();
    server.use(
      http.patch(`${API}/chargers/:id/status`, () =>
        HttpResponse.json({ error: 'You do not own this station' }, { status: 403 })
      )
    );
    renderDashboard();
    await screen.findByRole('heading', { name: 'Lekki Phase 1 Charging Hub' });

    await user.click(within(statusGroup(10)).getByRole('button', { name: 'Unavailable' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not own this station');
    expect(within(statusGroup(10)).getByRole('button', { name: 'Online' })).toHaveAttribute('aria-pressed', 'true');
  });
});
