import { useCallback, useEffect, useState } from 'react';
import StatusBadge from '../StatusBadge.jsx';
import ConfirmDialog from '../admin/ConfirmDialog.jsx';
import DataTable from '../admin/DataTable.jsx';
import { cancelOperatorBooking, listOperatorBookings } from '../../api/operator.js';
import { CONNECTOR_LABELS, formatDateTimeRange, formatNaira } from '../../utils/format.js';

// A station's bookings: a table on tablets and up, a card per booking on phones. Upcoming confirmed
// bookings can be cancelled, with a reason the audit log keeps.
export default function OperatorBookingsTable({ stationId }) {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(
    () =>
      listOperatorBookings({ stationId })
        .then((data) => {
          setBookings(data);
          setError('');
        })
        .catch(() => setError('Could not load bookings for this station.')),
    [stationId]
  );

  useEffect(() => {
    setBookings(null);
    load();
  }, [load]);

  async function cancel(reason) {
    setBusy(true);
    setDialogError('');
    try {
      await cancelOperatorBooking(cancelling.id, reason);
      setCancelling(null);
      await load();
    } catch (err) {
      setDialogError(err.response?.data?.error || 'Could not cancel this booking.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p role="alert" className="text-sm text-terracotta">{error}</p>;
  if (!bookings) return <p className="text-sm text-ink-2">Loading bookings…</p>;
  if (bookings.length === 0) {
    return <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">No bookings for this station yet.</p>;
  }

  const now = Date.now();
  const columns = [
    {
      key: 'reference',
      header: 'Reference',
      cell: (booking) => <span className="font-display text-[13px] font-semibold text-ink">{booking.booking_reference}</span>,
    },
    {
      key: 'driver',
      header: 'Driver',
      cell: (booking) => (
        <div className="flex flex-col items-end sm:items-start">
          <span className="text-ink">{booking.driver_name}</span>
          <span className="break-all text-[11px] text-ink-2">{booking.driver_email}</span>
        </div>
      ),
    },
    {
      key: 'charger',
      header: 'Charger',
      cell: (booking) => `${CONNECTOR_LABELS[booking.connector_type]} · ${booking.power_kw} kW`,
    },
    { key: 'when', header: 'Date & time', cell: (booking) => formatDateTimeRange(booking.start_time, booking.end_time) },
    { key: 'price', header: 'Price', cell: (booking) => formatNaira(booking.price_at_booking) },
    { key: 'status', header: 'Status', cell: (booking) => <StatusBadge status={booking.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      mobileLabel: '',
      cell: (booking) =>
        booking.status === 'confirmed' && new Date(booking.start_time).getTime() > now ? (
          <button
            type="button"
            aria-label={`Cancel booking ${booking.booking_reference}`}
            onClick={() => {
              setDialogError('');
              setCancelling(booking);
            }}
            className="min-h-10 whitespace-nowrap rounded-lg border border-terracotta px-3 text-[13px] font-semibold text-terracotta hover:bg-terracotta-tint"
          >
            Cancel
          </button>
        ) : (
          <span className="text-ink-2">—</span>
        ),
    },
  ];

  return (
    <>
      <DataTable label="Bookings for this station" columns={columns} rows={bookings} getKey={(booking) => booking.id} />
      {cancelling && (
        <ConfirmDialog
          title={`Cancel booking ${cancelling.booking_reference}?`}
          confirmLabel="Cancel booking"
          reasonLabel="Reason for cancelling (the driver will see the booking as cancelled)"
          busy={busy}
          error={dialogError}
          onConfirm={cancel}
          onCancel={() => setCancelling(null)}
        >
          {cancelling.driver_name}&apos;s slot ({formatDateTimeRange(cancelling.start_time, cancelling.end_time)}) will be
          freed for other drivers.
        </ConfirmDialog>
      )}
    </>
  );
}
