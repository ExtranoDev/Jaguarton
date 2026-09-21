import { useState } from 'react';
import { getCurrentPosition, searchPlaces } from '../../utils/geocode.js';

// Find a place by name, or jump to where you are. Calls onSelect({ lat, lng, label? }); it knows
// nothing about the map, so it can be tested (and reused) on its own. Deliberately not a <form>:
// it lives inside the add-station form, and forms can't nest (Enter would submit the outer one).
export default function LocationSearch({ onSelect, children }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = not searched yet
  const [status, setStatus] = useState({ busy: false, error: '' });

  async function search() {
    if (query.trim().length < 2) return;
    setStatus({ busy: true, error: '' });
    setResults(null);
    try {
      setResults(await searchPlaces(query));
      setStatus({ busy: false, error: '' });
    } catch (err) {
      setStatus({ busy: false, error: err.message });
    }
  }

  async function useMyLocation() {
    setStatus({ busy: true, error: '' });
    try {
      const point = await getCurrentPosition();
      setResults(null);
      setStatus({ busy: false, error: '' });
      onSelect(point);
    } catch (err) {
      setStatus({ busy: false, error: err.message });
    }
  }

  function choose(place) {
    setResults(null);
    setQuery(place.label);
    onSelect(place);
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="location-search" className="sr-only">
          Search for an address or place
        </label>
        <input
          id="location-search"
          type="search"
          placeholder="Search an address or place, e.g. Bodija, Ibadan"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink sm:flex-grow"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={search}
            disabled={status.busy || query.trim().length < 2}
            className="rounded-lg bg-green px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Search
          </button>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={status.busy}
            className="whitespace-nowrap rounded-lg border border-green px-3 py-2.5 text-[13px] font-semibold text-green-dark hover:bg-green-tint disabled:opacity-50"
          >
            Use my location
          </button>
          {children}
        </div>
      </div>

      {status.error && (
        <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
          {status.error}
        </p>
      )}
      {status.busy && (
        <p role="status" className="text-xs text-ink-2">
          Working…
        </p>
      )}
      {results && results.length === 0 && (
        <p role="status" className="text-sm text-ink-2">
          No places found. Try a nearby landmark or town name.
        </p>
      )}
      {results && results.length > 0 && (
        <ul aria-label="Search results" className="overflow-hidden rounded-lg border border-border bg-surface">
          {results.map((place) => (
            <li key={`${place.lat},${place.lng},${place.label}`} className="border-t border-border first:border-t-0">
              <button
                type="button"
                onClick={() => choose(place)}
                className="w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-green-tint"
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
