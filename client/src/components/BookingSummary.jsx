import { CONNECTOR_LABELS, formatDateTimeRange, formatNaira } from '../utils/format.js';
import { connectorList } from '../utils/connectors.js';

// `fitsCar` is false when the driver's car (from their account) doesn't take this charger's
// connector. That is a warning, not a block: adapters exist.
export default function BookingSummary({
  station,
  charger,
  fitsCar = null,
  carConnectors = [],
  slot,
  canBook,
  submitting,
  error,
  onBook,
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-green-dark p-6 text-white">
      <div className="flex justify-between gap-4 text-sm">
        <span className="text-[#CFE9DC]">Station</span>
        <span className="text-right font-semibold">{station.name}</span>
      </div>
      <div className="flex justify-between gap-4 text-sm">
        <span className="text-[#CFE9DC]">Charger</span>
        <span className="text-right font-semibold">
          {charger ? `${CONNECTOR_LABELS[charger.connector_type]} · ${charger.power_kw} kW` : '—'}
        </span>
      </div>
      <div className="flex justify-between gap-4 text-sm">
        <span className="text-[#CFE9DC]">Date &amp; time</span>
        <span className="text-right font-semibold">
          {slot ? formatDateTimeRange(slot.start_time, slot.end_time) : 'Select a time slot'}
        </span>
      </div>

      <div className="h-px bg-white/15" />

      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="text-[13px] text-[#CFE9DC]">Estimated price</span>
          <span className="text-[11px] text-[#CFE9DC]">per kWh delivered</span>
        </div>
        <span className="font-display text-[26px] font-bold text-volt">
          {charger ? formatNaira(charger.price_per_kwh) : '—'}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
          {error}
        </p>
      )}

      {canBook && charger && fitsCar === false && (
        <p id="connector-warning" role="note" className="rounded-lg border border-volt px-3 py-2 text-sm text-white">
          <strong className="text-volt">Check your adapter.</strong> This charger has a {CONNECTOR_LABELS[charger.connector_type]} connector; your
          car is set to {connectorList(carConnectors)}. You can still book it if you have an adapter.
        </p>
      )}

      {canBook ? (
        <button
          type="button"
          onClick={onBook}
          disabled={!slot || submitting}
          aria-describedby={fitsCar === false ? 'connector-warning' : undefined}
          className="mt-1.5 w-full rounded-[10px] bg-volt py-4 text-base font-bold text-volt-ink shadow-glow-volt disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none"
        >
          {submitting ? 'Booking…' : fitsCar === false ? 'Book Anyway →' : 'Book This Slot →'}
        </button>
      ) : (
        <p className="mt-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm text-[#CFE9DC]">
          Log in with a driver account to book a slot.
        </p>
      )}
    </div>
  );
}
