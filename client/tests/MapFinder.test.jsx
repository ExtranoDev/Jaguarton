import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import MapFinderPage from '../src/pages/MapFinderPage.jsx';
import ProtectedRoute from '../src/routes/ProtectedRoute.jsx';
import { API, server, signInAs } from './server.js';

// Leaflet needs real layout; what matters here is which stations the page hands to the map.
vi.mock('../src/components/MapView.jsx', () => ({
  default: ({ stations }) => <div data-testid="map-pins">{stations.map((s) => s.name).join('|')}</div>,
}));

const driver = { id: 2, name: 'Chidi Nwosu', email: 'driver@example.com', role: 'driver', is_active: true };

const station = (id, name, address, extra = {}) => ({
  id,
  name,
  address,
  lat: 7,
  lng: 3.5,
  is_active: true,
  chargers: [{ id: id * 10, status: 'online', price_per_kwh: 200 }],
  ...extra,
});
const STATIONS = [
  station(1, 'Lekki Phase 1 Charging Hub', 'Admiralty Way, Lekki Phase 1, Lagos'),
  station(2, 'Bodija Market EV Point', 'Bodija, Ibadan, Oyo State'),
  station(3, 'Ring Road Charging Hub', 'Ring Road, Ibadan, Oyo State'),
  station(4, 'Abeokuta Kuto Charging Hub', 'Kuto Road, Kuto, Abeokuta, Ogun State'),
  // Look-alikes that a plain substring search would wrongly match:
  station(5, 'Surulere Power Stop', 'Adeniran Ogunsanya St, Surulere, Lagos'),
  station(6, 'Sagamu Interchange Charging Hub', 'Lagos-Ibadan Expressway, Sagamu, Ogun State'),
];

afterEach(() => vi.restoreAllMocks());

function renderFinder() {
  const requests = [];
  signInAs(driver);
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json({ user: driver })),
    http.get(`${API}/stations`, ({ request }) => {
      const params = Object.fromEntries(new URL(request.url).searchParams);
      requests.push(params);
      return HttpResponse.json({ stations: STATIONS });
    })
  );
  render(
    <MemoryRouter>
      <AuthProvider>
        <MapFinderPage />
      </AuthProvider>
    </MemoryRouter>
  );
  return requests;
}

const pins = () => screen.getByTestId('map-pins').textContent.split('|').filter(Boolean);

describe("pre-filtering to the driver's car", () => {
  it("starts on the car's connectors, and the driver can widen it", async () => {
    const user = userEvent.setup();
    const requests = [];
    const withCar = { ...driver, connector_types: ['CCS2_DC', 'CHAdeMO_DC'] };
    signInAs(withCar);
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json({ user: withCar })),
      http.get(`${API}/stations`, ({ request }) => {
        requests.push(Object.fromEntries(new URL(request.url).searchParams));
        return HttpResponse.json({ stations: STATIONS });
      })
    );
    render(
      <MemoryRouter>
        <AuthProvider>
          <ProtectedRoute role="driver">
            <MapFinderPage />
          </ProtectedRoute>
        </AuthProvider>
      </MemoryRouter>
    );

    const ccs = await screen.findByRole('button', { name: 'CCS2 DC' });
    expect(ccs).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Type 2 AC' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/Showing your car's connectors/)).toBeInTheDocument();
    expect(requests[0]).toEqual({ connectorType: 'CCS2_DC,CHAdeMO_DC' });

    await user.click(ccs);
    await user.click(screen.getByRole('button', { name: 'CHAdeMO DC' }));
    expect(requests.at(-1)).toEqual({});
    expect(screen.queryByText(/Showing your car's connectors/)).not.toBeInTheDocument();
  });
});

describe('driver map page', () => {
  it('lists every station and puts every one on the map', async () => {
    renderFinder();

    expect(await screen.findByText('Bodija Market EV Point', { selector: 'span' })).toBeInTheDocument();
    expect(pins()).toHaveLength(6);
  });

  it('filters the list and the map together by town, state or name', async () => {
    const user = userEvent.setup();
    renderFinder();
    await screen.findByText('Bodija Market EV Point', { selector: 'span' });
    const search = screen.getByLabelText('Search stations by name or town');

    await user.type(search, 'ibadan');
    // Only stations in Ibadan, not the one on the Lagos-Ibadan Expressway in Ogun.
    expect(pins()).toEqual(['Bodija Market EV Point', 'Ring Road Charging Hub']);
    expect(screen.queryByText('Lekki Phase 1 Charging Hub', { selector: 'span' })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'Ogun');
    // Not Adeniran Ogunsanya Street in Lagos.
    expect(pins()).toEqual(['Abeokuta Kuto Charging Hub', 'Sagamu Interchange Charging Hub']);

    await user.clear(search);
    await user.type(search, 'kuto abeokuta'); // every word must match
    expect(pins()).toEqual(['Abeokuta Kuto Charging Hub']);

    await user.clear(search);
    await user.type(search, 'atlantis');
    expect(pins()).toEqual([]);
    expect(screen.getByText('No stations match these filters.')).toBeInTheDocument();
  });

  it('"Near me" asks the server for stations by distance, and turning it off drops the location', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 7.4, longitude: 3.9 } }) },
      configurable: true,
    });
    const requests = renderFinder();
    await screen.findByText('Bodija Market EV Point', { selector: 'span' });
    const button = screen.getByRole('button', { name: 'Near me' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    await screen.findByRole('button', { name: 'Near me', pressed: true });
    expect(requests.at(-1)).toMatchObject({ lat: '7.4', lng: '3.9' });

    await user.click(screen.getByRole('button', { name: 'Near me' }));
    await screen.findByRole('button', { name: 'Near me', pressed: false });
    expect(requests.at(-1)).not.toHaveProperty('lat');
  });

  it('explains when location access is blocked, and leaves the list alone', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) },
      configurable: true,
    });
    const requests = renderFinder();
    await screen.findByText('Bodija Market EV Point', { selector: 'span' });

    await user.click(screen.getByRole('button', { name: 'Near me' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked/i);
    expect(requests).toHaveLength(1); // no second request without a location
    expect(within(screen.getByRole('button', { name: 'Near me' }).parentElement).getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
});
