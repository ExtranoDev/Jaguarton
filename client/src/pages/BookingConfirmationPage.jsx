import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBooking } from '../api/bookings.js';
import { CONNECTOR_LABELS, formatDateTimeRange, formatNaira } from '../utils/format.js';

export default function BookingConfirmationPage() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBooking(id)
      .then((data) => {
        if (!cancelled) setBooking(data);
      })
      .catch(() => {
        if (!cancelled) setError('We could not find that booking.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(booking.booking_reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper p-6">
        <p className="text-sm text-terracotta">{error}</p>
        <Link to="/" className="text-sm font-semibold text-green">
          Back to map
        </Link>
      </div>
    );
  }

  if (!booking) {
    return <div className="flex min-h-screen items-center justify-center bg-paper text-ink-2">Loading…</div>;
  }

  const cancelled = booking.status === 'cancelled';

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-6 sm:p-6">
      <div className="flex w-full max-w-[560px] flex-col items-center gap-5 rounded-[20px] border border-border bg-surface p-6 text-center shadow-xl sm:p-12">
        <div
          className={`flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 ${
            cancelled
              ? 'border-terracotta bg-terracotta-tint'
              : 'border-green bg-green-tint shadow-[0_0_28px_rgba(10,122,69,0.45)]'
          }`}
        >
          {cancelled ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#A8401F" strokeWidth="3" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0A7A45" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </div>

        <h1 className="font-display text-2xl font-bold text-ink sm:text-[28px]">
          {cancelled ? 'Booking Cancelled' : 'Booking Confirmed!'}
        </h1>
        <p className="max-w-[380px] text-[15px] text-ink-2">
          {cancelled
            ? 'This booking was cancelled and the slot has been released.'
            : 'Your charging slot is reserved. Show this reference at the station.'}
        </p>

        <div className="flex w-full items-center justify-between rounded-xl border-2 border-dashed border-border bg-paper px-5 py-4">
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-2">Booking reference</span>
            <span className="font-display text-2xl font-bold tracking-wide text-ink">{booking.booking_reference}</span>
          </div>
          <button
            type="button"
            onClick={copyReference}
            className="min-h-10 rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink hover:border-green"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <dl className="flex w-full flex-col gap-2.5 border-t border-border pt-3 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">Station</dt>
            <dd className="text-right font-semibold text-ink">{booking.station_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">Charger</dt>
            <dd className="text-right font-semibold text-ink">
              {CONNECTOR_LABELS[booking.connector_type]} · {booking.power_kw} kW
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">Date &amp; time</dt>
            <dd className="text-right font-semibold text-ink">
              {formatDateTimeRange(booking.start_time, booking.end_time)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">Price</dt>
            <dd className="text-right font-bold text-green">{formatNaira(booking.price_at_booking)} per kWh</dd>
          </div>
        </dl>

        <div className="flex w-full flex-col-reverse gap-3 sm:flex-row">
          <Link
            to="/"
            className="flex-grow rounded-[10px] border border-border py-3 text-sm font-semibold text-ink hover:border-green"
          >
            Back to Map
          </Link>
          <Link
            to="/bookings"
            className="flex-grow rounded-[10px] bg-green py-3 text-sm font-semibold text-white"
          >
            View My Bookings
          </Link>
        </div>
      </div>
    </main>
  );
}
