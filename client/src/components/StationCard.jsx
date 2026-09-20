import { Link } from 'react-router-dom';

export default function StationCard({ station, selected }) {
  const chargers = station.chargers || [];
  const hasOnline = chargers.some((c) => c.status === 'online');
  const minPrice = chargers.length
    ? Math.min(...chargers.map((c) => Number(c.price_per_kwh)))
    : null;

  return (
    <Link
      to={`/stations/${station.id}`}
      className={`block rounded-2xl border p-3.5 transition-colors ${
        selected ? 'border-2 border-green bg-surface' : 'border-border bg-surface hover:border-green'
      } ${!hasOnline ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-semibold text-ink">{station.name}</span>
        <span
          className={`flex-shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${
            hasOnline ? 'bg-green-tint text-green-dark' : 'bg-sage-tint text-ink-2'
          }`}
        >
          {hasOnline ? 'Online' : 'Offline'}
        </span>
      </div>
      <p className="my-1 text-xs text-ink-2">{station.address}</p>
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>
          {station.distanceKm != null ? `${station.distanceKm} km · ` : ''}
          {chargers.length} charger{chargers.length === 1 ? '' : 's'}
        </span>
        {minPrice != null && (
          <span className={`font-bold ${hasOnline ? 'text-green' : 'text-ink-2'}`}>
            from ₦{minPrice}/kWh
          </span>
        )}
      </div>
    </Link>
  );
}
