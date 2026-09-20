import { useEffect, useState } from 'react';
import StatusBadge from '../StatusBadge.jsx';
import { listOperatorBookings } from '../../api/operator.js';
import { CONNECTOR_LABELS, formatDateTimeRange, formatNaira } from '../../utils/format.js';

const HEADERS = ['Reference', 'Driver', 'Charger', 'Date & time', 'Price', 'Status'];

export default function OperatorBookingsTable({ stationId }) {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setBookings(null);
    setError('');
    listOperatorBookings({ stationId })
      .then((data) => {
        if (!cancelled) setBookings(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load bookings for this station.');
      });
    return () => {
      cancelled = true;
    };
  }, [stationId]);

  if (error) return <p role="alert" className="text-sm text-terracotta">{error}</p>;
  if (!bookings) return <p className="text-sm text-ink-2">Loading bookings…</p>;
  if (bookings.length === 0) {
    return (
      <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">
        No bookings for this station yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-sage-tint">
            {HEADERS.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-3.5 py-2.5 text-left text-[11px] font-bold uppercase text-ink-2"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id} className="border-t border-border">
              <td className="px-3.5 py-3 font-display text-[13px] font-semibold text-ink">
                {booking.booking_reference}
              </td>
              <td className="px-3.5 py-3">
                <div className="flex flex-col">
                  <span className="text-ink">{booking.driver_name}</span>
                  <span className="text-[11px] text-ink-2">{booking.driver_email}</span>
                </div>
              </td>
              <td className="px-3.5 py-3 text-ink">
                {CONNECTOR_LABELS[booking.connector_type]} · {booking.power_kw} kW
              </td>
              <td className="px-3.5 py-3 text-ink">
                {formatDateTimeRange(booking.start_time, booking.end_time)}
              </td>
              <td className="px-3.5 py-3 text-ink">{formatNaira(booking.price_at_booking)}</td>
              <td className="px-3.5 py-3">
                <StatusBadge status={booking.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
