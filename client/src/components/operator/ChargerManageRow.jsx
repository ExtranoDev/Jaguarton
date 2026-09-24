import { useState } from 'react';
import { formatNaira } from '../../utils/format.js';
import StatusBadge from '../StatusBadge.jsx';
import ChargerSlots from './ChargerSlots.jsx';

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

const smallButton = 'min-h-10 rounded-lg border px-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none';

// One charger on the operator's station page: price, status, its slots, and archive/restore.
// An archived charger only offers Restore.
export default function ChargerManageRow({ charger, busy, onStatusChange, onPriceSave, onArchive }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState('');
  const [showSlots, setShowSlots] = useState(false);

  function startEditing() {
    setPrice(String(charger.price_per_kwh));
    setEditing(true);
  }

  async function savePrice(e) {
    e.preventDefault();
    const saved = await onPriceSave(charger, Number(price));
    if (saved) setEditing(false);
  }

  const priceValid = price !== '' && Number.isFinite(Number(price)) && Number(price) > 0;

  if (charger.archived) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-sage-tint px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-ink">
            {CONNECTOR_TITLES[charger.connector_type]} · {charger.power_kw} kW
          </span>
          <span className="flex items-center gap-2 text-[11px] text-ink-2">
            Charger #{charger.id} <StatusBadge status="archived" />
          </span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => onArchive(charger, false)}
          aria-label={`Restore charger ${charger.id}`}
          className={`${smallButton} border-green text-green-dark hover:bg-green-tint`}
        >
          Restore
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
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
              min="0.01"
              step="0.01"
              autoFocus
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="min-h-10 w-24 rounded-lg border border-border px-2.5 py-1.5 text-sm"
            />
            <span className="text-sm text-ink-2">/kWh</span>
            <button
              type="submit"
              disabled={!priceValid || busy}
              className="min-h-10 rounded-lg bg-green px-3 py-1.5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-10 rounded-lg border border-border px-3 py-1.5 text-[13px] text-ink-2"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            aria-label={`Edit price for charger ${charger.id}`}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-semibold text-ink hover:border-green"
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
                className={`min-h-10 rounded-full border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none ${
                  active ? `${status.active} font-semibold` : 'border-border bg-surface text-ink-2 hover:border-ink-2'
                }`}
              >
                {status.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-expanded={showSlots}
          onClick={() => setShowSlots(!showSlots)}
          className={`${smallButton} border-border text-ink hover:border-green`}
        >
          {/* The name starts with the visible words, so voice control ("click Slots") finds it. */}
          {showSlots ? 'Hide slots' : 'Slots: block or unblock'}{' '}
          <span className="sr-only">for charger {charger.id}</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onArchive(charger, true)}
          aria-label={`Archive charger ${charger.id}`}
          className={`${smallButton} border-border text-ink-2 hover:border-terracotta hover:text-terracotta`}
        >
          Archive
        </button>
      </div>
      {showSlots && <ChargerSlots charger={charger} />}
    </div>
  );
}
