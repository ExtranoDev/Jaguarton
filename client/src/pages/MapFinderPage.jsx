import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import StationCard from '../components/StationCard.jsx';
import MapView from '../components/MapView.jsx';
import { listStations } from '../api/stations.js';

export default function MapFinderPage() {
  const [filters, setFilters] = useState({});
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          <FilterPanel filters={filters} onChange={setFilters} resultCount={stations.length} />

          {loading && <p className="text-sm text-ink-2">Loading stations…</p>}
          {error && <p className="text-sm text-terracotta">{error}</p>}

          <div className="flex flex-col gap-3">
            {stations.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
            {!loading && !error && stations.length === 0 && (
              <p className="text-sm text-ink-2">No stations match these filters.</p>
            )}
          </div>
        </div>

        <div className="order-1 h-[340px] flex-shrink-0 lg:order-2 lg:h-auto lg:flex-grow">
          <MapView stations={stations} />
        </div>
      </div>
    </div>
  );
}
