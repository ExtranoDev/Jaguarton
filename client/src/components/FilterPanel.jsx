const CONNECTOR_TYPES = [
  { value: 'Type2_AC', label: 'Type 2 AC' },
  { value: 'CCS2_DC', label: 'CCS2 DC' },
  { value: 'CHAdeMO_DC', label: 'CHAdeMO DC' },
];

// `fromCar` is true while the connector chips still hold the driver's car's connectors from their
// account, so we can say why they are pre-selected.
export default function FilterPanel({ filters, onChange, resultCount, fromCar = false }) {
  const selected = filters.connectorTypes || [];

  function toggleConnector(value) {
    const next = selected.includes(value) ? selected.filter((type) => type !== value) : [...selected, value];
    onChange({ ...filters, connectorTypes: next.length > 0 ? next : undefined });
  }

  function toggleOnlineOnly(checked) {
    onChange({ ...filters, status: checked ? 'online' : undefined });
  }

  function setPrice(field, value) {
    onChange({ ...filters, [field]: value === '' ? undefined : Number(value) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span id="price-range-label" className="text-[11px] font-bold uppercase tracking-wide text-ink-2">
          Price range (₦/kWh)
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            aria-label="Minimum price per kWh"
            value={filters.minPrice ?? ''}
            onChange={(e) => setPrice('minPrice', e.target.value)}
            className="min-h-10 w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
          <span className="text-ink-2" aria-hidden="true">
            –
          </span>
          <input
            type="number"
            min="0"
            placeholder="Max"
            aria-label="Maximum price per kWh"
            value={filters.maxPrice ?? ''}
            onChange={(e) => setPrice('maxPrice', e.target.value)}
            className="min-h-10 w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span id="connector-filter-label" className="text-[11px] font-bold uppercase tracking-wide text-ink-2">
          Connector type
        </span>
        <div role="group" aria-labelledby="connector-filter-label" className="flex flex-wrap gap-2">
          {CONNECTOR_TYPES.map((type) => {
            const active = selected.includes(type.value);
            return (
              <button
                key={type.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleConnector(type.value)}
                className={`min-h-10 rounded-full border px-3.5 text-[13px] font-semibold ${
                  active ? 'border-green bg-green-tint text-green-dark' : 'border-border bg-surface text-ink-2'
                }`}
              >
                {type.label}
              </button>
            );
          })}
        </div>
        {fromCar && <p className="text-xs text-ink-2">Showing your car&apos;s connectors (set on your Account page).</p>}
      </div>

      <label className="flex min-h-10 items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          checked={filters.status === 'online'}
          onChange={(e) => toggleOnlineOnly(e.target.checked)}
          className="h-5 w-5 accent-green"
        />
        Online chargers only
      </label>

      <div className="h-px bg-border" />

      <p role="status" className="text-sm font-semibold text-ink">
        {resultCount} station{resultCount === 1 ? '' : 's'} found
      </p>
    </div>
  );
}
