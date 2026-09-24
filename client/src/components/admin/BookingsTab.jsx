import { useState } from 'react';
import { cancelBooking, listBookings, listStations } from '../../api/admin.js';
import { CONNECTOR_LABELS, formatDateTimeRange, formatNaira } from '../../utils/format.js';
import StatusBadge from '../StatusBadge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import DataTable from './DataTable.jsx';
import { EmptyState, ErrorBanner, LoadState, RowButton, fieldClass } from './ui.jsx';
import Pager from '../Pager.jsx';
import useAdminData, { errorMessage, usePage } from './useAdminData.js';

const PAGE_SIZE = 50;

export default function BookingsTab() {
  const [status, setStatus] = useState('');
  const [stationId, setStationId] = useState('');
  const [date, setDate] = useState('');
  const filterKey = `${status}|${stationId}|${date}`;
  const [page, setPage] = usePage(filterKey);
  const { data, error, reload } = useAdminData(
    () => listBookings({ status, stationId, date, page, pageSize: PAGE_SIZE }),
    `${filterKey}|${page}`,
    'Could not load bookings.'
  );
  const bookings = data?.bookings;
  const { data: stations } = useAdminData(listStations, 'stations', 'Could not load stations.');
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  async function cancel(booking, reason) {
    setBusy(true);
    setActionError('');
    try {
      await cancelBooking(booking.id, reason);
      setConfirming(null);
      reload();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not cancel this booking.'));
    } finally {
      setBusy(false);
    }
  }

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
        <div className="flex flex-col">
          <span className="text-ink">{booking.driver_name}</span>
          <span className="break-all text-[11px] text-ink-2">{booking.driver_email}</span>
        </div>
      ),
    },
    {
      key: 'station',
      header: 'Station',
      cell: (booking) => (
        <div className="flex flex-col">
          <span className="text-ink">{booking.station_name}</span>
          <span className="text-[11px] text-ink-2">
            {CONNECTOR_LABELS[booking.connector_type]} · {booking.power_kw} kW
          </span>
        </div>
      ),
    },
    {
      key: 'time',
      header: 'Date & time',
      cell: (booking) => formatDateTimeRange(booking.start_time, booking.end_time),
    },
    { key: 'price', header: 'Price', cell: (booking) => formatNaira(booking.price_at_booking) },
    { key: 'status', header: 'Status', cell: (booking) => <StatusBadge status={booking.status} /> },
    {
      key: 'action',
      header: 'Action',
      mobileLabel: '',
      cell: (booking) =>
        booking.status === 'confirmed' ? (
          <RowButton
            danger
            aria-label={`Cancel booking ${booking.booking_reference}`}
            onClick={() => {
              setActionError('');
              setConfirming(booking);
            }}
          >
            Cancel
          </RowButton>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
          <option value="">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          aria-label="Filter by station"
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className={`${fieldClass} sm:max-w-[260px]`}
        >
          <option value="">All stations</option>
          {(stations || []).map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Filter by slot date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={fieldClass}
        />
      </div>

      <LoadState data={bookings} error={error}>
        {actionError && !confirming && <ErrorBanner>{actionError}</ErrorBanner>}
        {bookings?.length === 0 ? (
          <EmptyState>No bookings match those filters.</EmptyState>
        ) : (
          <>
            <Pager page={data?.page || 1} pageSize={PAGE_SIZE} total={data?.total} onPage={setPage} label="bookings, newest first" />
            <DataTable label="Bookings" columns={columns} rows={bookings || []} getKey={(booking) => booking.id} />
            <Pager
              page={data?.page || 1}
              pageSize={PAGE_SIZE}
              total={data?.total}
              onPage={setPage}
              label="bookings, newest first"
              announce={false}
            />
          </>
        )}
      </LoadState>

      {confirming && (
        <ConfirmDialog
          title={`Cancel booking ${confirming.booking_reference}?`}
          confirmLabel="Cancel booking"
          reasonLabel="Reason for cancelling"
          busy={busy}
          error={actionError}
          onConfirm={(reason) => cancel(confirming, reason)}
          onCancel={() => setConfirming(null)}
        >
          {confirming.driver_name}&apos;s slot at {confirming.station_name} (
          {formatDateTimeRange(confirming.start_time, confirming.end_time)}) will be freed for other drivers. The reason
          is saved in the audit log.
        </ConfirmDialog>
      )}
    </div>
  );
}
