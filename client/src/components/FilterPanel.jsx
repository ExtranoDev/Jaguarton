const CONNECTOR_TYPES = [
  { value: 'Type2_AC', label: 'Type 2 AC' },
  { value: 'CCS2_DC', label: 'CCS2 DC' },
  { value: 'CHAdeMO_DC', label: 'CHAdeMO DC' },
];

export default function FilterPanel({ filters, onChange, resultCount }) {
  function toggleConnector(value) {
    onChange({ ...filters, connectorType: filters.connectorType === value ? undefined : value });
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
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-2">Price range (₦/kWh)</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            value={filters.minPrice ?? ''}
            onChange={(e) => setPrice('minPrice', e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
          <span className="text-ink-2">–</span>
          <input
            type="number"
            min="0"
            placeholder="Max"
            value={filters.maxPrice ?? ''}
            onChange={(e) => setPrice('maxPrice', e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-2">Connector type</span>
        <div className="flex flex-wrap gap-2">
          {CONNECTOR_TYPES.map((type) => {
            const active = filters.connectorType === type.value;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => toggleConnector(type.value)}
                className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                  active
                    ? 'border-green bg-green-tint text-green-dark'
                    : 'border-border bg-surface text-ink-2'
                }`}
              >
                {type.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          checked={filters.status === 'online'}
          onChange={(e) => toggleOnlineOnly(e.target.checked)}
          className="h-4 w-4 accent-green"
        />
        Online chargers only
      </label>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">
          {resultCount} station{resultCount === 1 ? '' : 's'} found
        </span>
      </div>
    </div>
  );
}
