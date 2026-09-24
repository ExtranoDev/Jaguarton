import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { cancelBooking, listMyBookings } from '../api/bookings.js';
import { CONNECTOR_LABELS, formatDateTimeRange, formatNaira } from '../utils/format.js';

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  async function load() {
    try {
      setBookings(await listMyBookings());
      setError('');
    } catch {
      setError('Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCancel(booking) {
    if (!window.confirm(`Cancel booking ${booking.booking_reference}?`)) return;
    setCancellingId(booking.id);
    try {
      await cancelBooking(booking.id);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel this booking.');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <Navbar active="bookings" />

      <main className="overflow-y-auto px-4 py-6 sm:px-8">
        <h1 className="font-display text-[26px] font-bold text-ink">My Bookings</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          {bookings.length} booking{bookings.length === 1 ? '' : 's'}
        </p>

        {error && <p role="alert" className="mt-4 text-sm text-terracotta">{error}</p>}
        {loading && <p className="mt-6 text-sm text-ink-2">Loading…</p>}

        {!loading && bookings.length === 0 && !error && (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-10 text-center">
            <p className="text-ink-2">You haven&apos;t booked a charging slot yet.</p>
            <Link to="/" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-green">
              Find a charger →
            </Link>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {bookings.map((booking) => {
            const upcoming = new Date(booking.start_time).getTime() > Date.now();
            const canCancel = booking.status === 'confirmed' && upcoming;
            return (
              <div
                key={booking.id}
                className={`flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between ${
                  booking.status === 'cancelled' ? 'border-dashed bg-sage-tint' : ''
                }`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/bookings/${booking.id}/confirmation`}
                      className="inline-flex min-h-10 items-center font-display text-base font-bold tracking-wide text-ink hover:text-green"
                    >
                      {booking.booking_reference}
                    </Link>
                    <StatusBadge status={booking.status} />
                  </div>
                  <span className="text-[15px] font-semibold text-ink">{booking.station_name}</span>
                  <span className="text-xs text-ink-2">
                    {CONNECTOR_LABELS[booking.connector_type]} · {booking.power_kw} kW ·{' '}
                    {formatDateTimeRange(booking.start_time, booking.end_time)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <span className="text-sm font-bold text-green">
                    {formatNaira(booking.price_at_booking)}/kWh
                  </span>
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => handleCancel(booking)}
                      disabled={cancellingId === booking.id}
                      className="min-h-10 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold text-ink-2 hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none"
                    >
                      {cancellingId === booking.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
