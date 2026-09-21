import { useEffect, useMemo, useState } from 'react';
import Navbar from '../components/Navbar.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import StationCard from '../components/StationCard.jsx';
import MapView from '../components/MapView.jsx';
import { listStations } from '../api/stations.js';
import { getCurrentPosition } from '../utils/geocode.js';
import { matchesStationSearch } from '../utils/stationSearch.js';

export default function MapFinderPage() {
  const [filters, setFilters] = useState({});
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [locationError, setLocationError] = useState('');

  // Name/town search runs on the loaded list, so it is instant and the map follows it.
  const visible = useMemo(() => stations.filter((s) => matchesStationSearch(s, query)), [stations, query]);

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
    <div className="flex h-screen flex-col overflow-hidden bg-paper">
      <Navbar active="primary" />
      {/* Phones: map on top, filters + list below, page scrolls. Desktop: sidebar left, map right. */}
      <div className="flex flex-grow flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="order-2 flex w-full flex-shrink-0 flex-col gap-4 border-t border-border bg-surface p-6 lg:order-1 lg:w-[380px] lg:overflow-y-auto lg:border-r lg:border-t-0">
          <h2 className="font-display text-xl font-semibold text-ink">Find a charger</h2>
          <div className="flex gap-2">
            <input
              type="search"
              aria-label="Search stations by name or town"
              placeholder="Name or town, e.g. Ibadan"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-grow rounded-lg border border-border px-3 py-2 text-sm"
            />
            <button
              type="button"
              aria-pressed={nearMe}
              onClick={toggleNearMe}
              className={`flex-shrink-0 rounded-lg border px-3 py-2 text-[13px] font-semibold ${
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

          <FilterPanel filters={filters} onChange={setFilters} resultCount={visible.length} />

          {loading && <p className="text-sm text-ink-2">Loading stations…</p>}
          {error && <p className="text-sm text-terracotta">{error}</p>}

          <div className="flex flex-col gap-3">
            {visible.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
            {!loading && !error && visible.length === 0 && (
              <p className="text-sm text-ink-2">No stations match these filters.</p>
            )}
          </div>
        </div>

        <div className="order-1 h-[340px] flex-shrink-0 lg:order-2 lg:h-auto lg:flex-grow">
          <MapView stations={visible} />
        </div>
      </div>
    </div>
  );
}
