import { useState } from 'react';
import { formatNaira } from '../../utils/format.js';

const CONNECTOR_TITLES = {
  Type2_AC: 'Type 2 AC',
  CCS2_DC: 'CCS2 DC',
  CHAdeMO_DC: 'CHAdeMO DC',
};

const STATUSES = [
  { value: 'online', label: 'Online', active: 'border-green bg-green text-white' },
  { value: 'offline', label: 'Offline', active: 'border-ink-2 bg-ink-2 text-white' },
  { value: 'unavailable', label: 'Unavailable', active: 'border-terracotta bg-terracotta text-white' },
];

export default function ChargerManageRow({ charger, busy, onStatusChange, onPriceSave }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState('');

  function startEditing() {
    setPrice(String(charger.price_per_kwh));
    setEditing(true);
  }

  async function savePrice(e) {
    e.preventDefault();
    const saved = await onPriceSave(charger, Number(price));
    if (saved) setEditing(false);
  }

  const priceValid = price !== '' && Number.isFinite(Number(price)) && Number(price) >= 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <div className="flex min-w-[200px] items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-[9px] text-[9px] font-bold ${
            charger.status === 'online' ? 'bg-green-tint text-green-dark' : 'bg-sage-tint text-ink-2'
          }`}
        >
          {charger.connector_type.split('_')[0]}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-ink">
            {CONNECTOR_TITLES[charger.connector_type]} · {charger.power_kw} kW
          </span>
          <span className="text-[11px] text-ink-2">Charger #{charger.id}</span>
        </div>
      </div>

      {editing ? (
        <form onSubmit={savePrice} className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`price-${charger.id}`}>
            Price per kWh
          </label>
          <span className="text-sm text-ink-2">₦</span>
          <input
            id={`price-${charger.id}`}
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-24 rounded-lg border border-border px-2.5 py-1.5 text-sm"
          />
          <span className="text-sm text-ink-2">/kWh</span>
          <button
            type="submit"
            disabled={!priceValid || busy}
            className="rounded-lg bg-green px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-ink-2"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          aria-label={`Edit price for charger ${charger.id}`}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-semibold text-ink hover:border-green"
        >
          {formatNaira(charger.price_per_kwh)} /kWh
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#55665C" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}

      <div className="flex gap-1.5" role="group" aria-label={`Status for charger ${charger.id}`}>
        {STATUSES.map((status) => {
          const active = charger.status === status.value;
          return (
            <button
              key={status.value}
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={() => !active && onStatusChange(charger, status.value)}
              className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-60 ${
                active ? `${status.active} font-semibold` : 'border-border bg-surface text-ink-2 hover:border-ink-2'
              }`}
            >
              {status.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
