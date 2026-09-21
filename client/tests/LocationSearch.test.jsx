import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LocationSearch from '../src/components/operator/LocationSearch.jsx';
import { searchPlaces } from '../src/utils/geocode.js';
import { directionsUrl } from '../src/utils/maps.js';
import { server } from './server.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const MAPTILER = 'https://api.maptiler.com/geocoding/:query';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stubGeolocation(impl) {
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: impl }, configurable: true });
}

describe('searching for a place', () => {
  it('lists matches from OpenStreetMap and hands the chosen one back with its name', async () => {
    const user = userEvent.setup();
    let requested;
    server.use(
      http.get(NOMINATIM, ({ request }) => {
        requested = new URL(request.url).searchParams;
        return HttpResponse.json([
          { display_name: 'Bodija, Ibadan, Oyo State, Nigeria', lat: '7.4365', lon: '3.9138' },
          { display_name: 'Bodija Market, Ibadan, Oyo State, Nigeria', lat: '7.4381', lon: '3.9143' },
        ]);
      })
    );
    const onSelect = vi.fn();
    render(<LocationSearch onSelect={onSelect} />);

    await user.type(screen.getByLabelText('Search for an address or place'), 'Bodija');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    const results = await screen.findByRole('list', { name: 'Search results' });
    expect(within(results).getAllByRole('button')).toHaveLength(2);
    expect(requested.get('q')).toBe('Bodija');
    expect(requested.get('countrycodes')).toBe('ng'); // limited to Nigeria
    await user.click(within(results).getByRole('button', { name: 'Bodija, Ibadan, Oyo State, Nigeria' }));

    expect(onSelect).toHaveBeenCalledWith({ label: 'Bodija, Ibadan, Oyo State, Nigeria', lat: 7.4365, lng: 3.9138 });
    expect(screen.queryByRole('list', { name: 'Search results' })).not.toBeInTheDocument();
  });

  it('uses MapTiler when a key is configured', async () => {
    vi.stubEnv('VITE_MAPTILER_KEY', 'test-key');
    let seen;
    server.use(
      http.get(MAPTILER, ({ request, params }) => {
        seen = { path: decodeURIComponent(params.query), search: new URL(request.url).searchParams };
        return HttpResponse.json({ features: [{ place_name: 'Abeokuta, Ogun, Nigeria', center: [3.3619, 7.1475] }] });
      })
    );

    const places = await searchPlaces('Abeokuta');

    expect(places).toEqual([{ label: 'Abeokuta, Ogun, Nigeria', lat: 7.1475, lng: 3.3619 }]); // [lng, lat] from MapTiler
    expect(seen.path).toBe('Abeokuta.json'); // MapTiler's geocoding endpoint is /geocoding/<query>.json
    expect(seen.search.get('key')).toBe('test-key');
    expect(seen.search.get('country')).toBe('ng');
  });

  it('searches on Enter without submitting the surrounding form', async () => {
    const user = userEvent.setup();
    server.use(http.get(NOMINATIM, () => HttpResponse.json([{ display_name: 'Ring Road, Ibadan', lat: '7.3955', lon: '3.9095' }])));
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <LocationSearch onSelect={() => {}} />
      </form>
    );

    await user.type(screen.getByLabelText('Search for an address or place'), 'Ring Road{Enter}');

    expect(await screen.findByRole('list', { name: 'Search results' })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says so when nothing matches, and when the search service is down', async () => {
    const user = userEvent.setup();
    server.use(http.get(NOMINATIM, () => HttpResponse.json([])));
    render(<LocationSearch onSelect={() => {}} />);
    const box = screen.getByLabelText('Search for an address or place');

    await user.type(box, 'zzzz nowhere');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/No places found/)).toBeInTheDocument();

    server.use(http.get(NOMINATIM, () => new HttpResponse(null, { status: 500 })));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/search is unavailable/i);
  });

  it('does nothing for a query that is too short', async () => {
    const user = userEvent.setup();
    render(<LocationSearch onSelect={() => {}} />);

    await user.type(screen.getByLabelText('Search for an address or place'), 'a');

    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    expect(await searchPlaces('a')).toEqual([]);
  });
});

describe('use my location', () => {
  it('hands back where the browser says you are', async () => {
    const user = userEvent.setup();
    stubGeolocation((ok) => ok({ coords: { latitude: 7.4, longitude: 3.9 } }));
    const onSelect = vi.fn();
    render(<LocationSearch onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(onSelect).toHaveBeenCalledWith({ lat: 7.4, lng: 3.9 });
  });

  it('explains what to do when location access is blocked', async () => {
    const user = userEvent.setup();
    stubGeolocation((_ok, fail) => fail({ code: 1 }));
    const onSelect = vi.fn();
    render(<LocationSearch onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked/i);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('directionsUrl', () => {
  it('points Google Maps at the station', () => {
    expect(directionsUrl(7.4365, '3.9138')).toBe('https://www.google.com/maps/dir/?api=1&destination=7.4365,3.9138');
  });
});
