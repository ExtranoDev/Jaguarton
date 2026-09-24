import { useEffect, useMemo, useState } from 'react';
import Navbar from '../components/Navbar.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import StationCard from '../components/StationCard.jsx';
import MapView from '../components/MapView.jsx';
import { listStations } from '../api/stations.js';
import { useAuth } from '../context/AuthContext.jsx';
import { carConnectors } from '../utils/connectors.js';
import { getCurrentPosition } from '../utils/geocode.js';
import { matchesStationSearch } from '../utils/stationSearch.js';

const sameTypes = (a = [], b = []) => a.length === b.length && a.every((type) => b.includes(type));

// How many filters are on, for the phone-sized "Filters" toggle.
function activeFilterCount(filters) {
  return (
    (filters.connectorTypes?.length ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.minPrice != null || filters.maxPrice != null ? 1 : 0)
  );
}

export default function MapFinderPage() {
  const { user } = useAuth();
  const myConnectors = carConnectors(user);
  // A driver who has told us their car's connectors starts on just the chargers that fit it.
  const [filters, setFilters] = useState(() => (myConnectors.length > 0 ? { connectorTypes: myConnectors } : {}));
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [locationError, setLocationError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Name/town search runs on the loaded list, so it is instant and the map follows it.
  const visible = useMemo(() => stations.filter((s) => matchesStationSearch(s, query)), [stations, query]);
  const fromCar = myConnectors.length > 0 && sameTypes(filters.connectorTypes, myConnectors);
  const filterCount = activeFilterCount(filters);

  const nearMe = filters.lat != null;
  async function toggleNearMe() {
    setLocationError('');
    if (nearMe) {
      const { lat: _lat, lng: _lng, ...rest } = filters;
      setFilters(rest);
      return;
    }
    try {
      const { lat, lng } = await getCurrentPosition();
      setFilters({ ...filters, lat, lng });
    } catch (err) {
      setLocationError(err.message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listStations(filters)
      .then((data) => {
        if (!cancelled) setStations(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load stations. Is the API running?');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <Navbar active="primary" />
      {/* Phones: map on top, search + list below, page scrolls. Desktop: sidebar left, map right. */}
      <main className="flex flex-grow flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="order-2 flex w-full flex-shrink-0 flex-col gap-4 border-t border-border bg-surface p-4 sm:p-6 lg:order-1 lg:w-[380px] lg:overflow-y-auto lg:border-r lg:border-t-0">
          <h1 className="font-display text-xl font-semibold text-ink">Find a charger</h1>
          <div className="flex gap-2">
            <input
              type="search"
              aria-label="Search stations by name or town"
              placeholder="Name or town, e.g. Ibadan"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-10 min-w-0 flex-grow rounded-lg border border-border px-3 py-2 text-sm"
            />
            <button
              type="button"
              aria-pressed={nearMe}
              onClick={toggleNearMe}
              className={`min-h-10 flex-shrink-0 rounded-lg border px-3 text-[13px] font-semibold ${
                nearMe ? 'border-green bg-green-tint text-green-dark' : 'border-border text-ink-2 hover:border-green'
              }`}
            >
              Near me
            </button>
          </div>
          {locationError && (
            <p role="alert" className="text-sm text-terracotta">
              {locationError}
            </p>
          )}

          {/* Filters fold away on phones so the list starts right under the map. */}
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="station-filters"
            onClick={() => setFiltersOpen((open) => !open)}
            className="flex min-h-10 items-center justify-between rounded-lg border border-border px-3.5 text-[13px] font-semibold text-ink lg:hidden"
          >
            <span>
              Filters{filterCount > 0 ? ` (${filterCount} on)` : ''} · {visible.length} station{visible.length === 1 ? '' : 's'}
            </span>
            <span aria-hidden="true">{filtersOpen ? '▲' : '▼'}</span>
          </button>
          <div id="station-filters" className={filtersOpen ? '' : 'hidden lg:block'}>
            <FilterPanel filters={filters} onChange={setFilters} resultCount={visible.length} fromCar={fromCar} />
          </div>

          {loading && <p className="text-sm text-ink-2">Loading stations…</p>}
          {error && <p className="text-sm text-terracotta">{error}</p>}

          <h2 className="sr-only">Stations</h2>
          <div className="flex flex-col gap-3">
            {visible.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
            {!loading && !error && visible.length === 0 && (
              <p className="text-sm text-ink-2">No stations match these filters.</p>
            )}
          </div>
        </div>

        <div className="order-1 h-[42vh] min-h-[260px] flex-shrink-0 lg:order-2 lg:h-auto lg:flex-grow">
          <MapView stations={visible} />
        </div>
      </main>
    </div>
  );
}
