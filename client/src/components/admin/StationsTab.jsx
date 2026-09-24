import { useState } from 'react';
import { listStations, reviewStation, setChargerStatus, setStationActive } from '../../api/admin.js';
import { CONNECTOR_LABELS } from '../../utils/format.js';
import StatusBadge from '../StatusBadge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { EmptyState, ErrorBanner, LoadState, RowButton, fieldClass } from './ui.jsx';
import useAdminData, { errorMessage } from './useAdminData.js';

const CHARGER_STATUSES = [
  { value: 'online', label: 'Online', active: 'border-green bg-green text-white' },
  { value: 'offline', label: 'Offline', active: 'border-ink-2 bg-ink-2 text-white' },
  { value: 'unavailable', label: 'Unavailable', active: 'border-terracotta bg-terracotta text-white' },
];

const FILTERS = [
  { value: '', label: 'All stations' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function ChargerRow({ charger, busy, onStatusChange }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-ink">
          {CONNECTOR_LABELS[charger.connector_type]} · {charger.power_kw} kW
        </span>
        <span className="flex items-center gap-2 text-[11px] text-ink-2">
          Charger #{charger.id} {charger.archived && <StatusBadge status="archived" />}
        </span>
      </div>
      {!charger.archived && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Status for charger ${charger.id}`}>
          {CHARGER_STATUSES.map((status) => {
            const active = charger.status === status.value;
            return (
              <button
                key={status.value}
                type="button"
                aria-pressed={active}
                disabled={busy}
                onClick={() => !active && onStatusChange(charger, status.value)}
                className={`min-h-10 rounded-full border px-3 text-xs disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none ${
                  active ? `${status.active} font-semibold` : 'border-border bg-surface text-ink-2 hover:border-ink-2'
                }`}
              >
                {status.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StationBadges({ station }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {station.archived && <StatusBadge status="archived" />}
      {station.approval_status !== 'approved' && <StatusBadge status={station.approval_status} />}
      <StatusBadge status={station.is_active ? 'active' : 'deactivated'} />
      {!station.owner_active && <StatusBadge status="suspended" />}
    </span>
  );
}

export default function StationsTab() {
  const [approval, setApproval] = useState('');
  const { data: stations, error, reload } = useAdminData(() => listStations({ approval }), approval, 'Could not load stations.');
  // One dialog at a time: { type: 'deactivate' | 'reject' | 'status', station?, charger?, status?, count? }
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyChargerId, setBusyChargerId] = useState(null);
  const [actionError, setActionError] = useState('');

  const open = (next) => {
    setActionError('');
    setDialog(next);
  };

  async function run(task, failure) {
    setBusy(true);
    setActionError('');
    try {
      await task();
      setDialog(null);
      reload();
    } catch (err) {
      setActionError(errorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  }

  const changeStation = (station, isActive, reason) =>
    run(() => setStationActive(station.id, isActive, reason), 'Could not update this station.');
  const review = (station, decision, reason) =>
    run(() => reviewStation(station.id, decision, reason), decision === 'approve' ? 'Could not approve this station.' : 'Could not reject this station.');

  // Taking a charger with upcoming bookings offline asks first (the API answers 409 with the count).
  async function changeChargerStatus(charger, status, confirm = false) {
    setBusyChargerId(charger.id);
    setActionError('');
    try {
      await setChargerStatus(charger.id, status, confirm);
      setDialog(null);
      reload();
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.code === 'CONFIRM_REQUIRED') {
        setDialog({ type: 'status', charger, status, count: data.upcomingBookings });
      } else {
        setActionError(errorMessage(err, 'Could not update the charger.'));
      }
    } finally {
      setBusyChargerId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <select aria-label="Filter stations" value={approval} onChange={(e) => setApproval(e.target.value)} className={fieldClass}>
        {FILTERS.map((filter) => (
          <option key={filter.value} value={filter.value}>
            {filter.label}
          </option>
        ))}
      </select>

      <LoadState data={stations} error={error}>
        {actionError && !dialog && <ErrorBanner>{actionError}</ErrorBanner>}
        {stations?.length === 0 && (
          <EmptyState>{approval === 'pending' ? 'No stations are waiting for approval.' : 'No stations match this filter.'}</EmptyState>
        )}
        <ul className="grid gap-3 lg:grid-cols-2">
          {(stations || []).map((station) => (
            <li key={station.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <h3 className="text-sm font-semibold text-ink">{station.name}</h3>
                  <span className="text-xs text-ink-2">{station.address}</span>
                  <span className="mt-1 break-all text-[11px] text-ink-2">
                    Owner: {station.owner_name} · {station.owner_email}
                  </span>
                  {station.approval_status === 'rejected' && station.review_note && (
                    <span className="mt-1 text-xs text-terracotta">Rejected: {station.review_note}</span>
                  )}
                </div>
                <StationBadges station={station} />
              </div>

              <div>
                {station.chargers.length === 0 && <p className="py-2 text-xs text-ink-2">No chargers yet</p>}
                {station.chargers.map((charger) => (
                  <ChargerRow
                    key={charger.id}
                    charger={charger}
                    busy={busyChargerId === charger.id}
                    onStatusChange={changeChargerStatus}
                  />
                ))}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {station.approval_status !== 'approved' && (
                  <>
                    <RowButton aria-label={`Approve ${station.name}`} disabled={busy} onClick={() => review(station, 'approve')}>
                      Approve
                    </RowButton>
                    {station.approval_status === 'pending' && (
                      <RowButton danger aria-label={`Reject ${station.name}`} onClick={() => open({ type: 'reject', station })}>
                        Reject
                      </RowButton>
                    )}
                  </>
                )}
                {station.is_active ? (
                  <RowButton danger aria-label={`Deactivate ${station.name}`} onClick={() => open({ type: 'deactivate', station })}>
                    Deactivate
                  </RowButton>
                ) : (
                  <RowButton aria-label={`Reactivate ${station.name}`} disabled={busy} onClick={() => changeStation(station, true)}>
                    Reactivate
                  </RowButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      </LoadState>

      {dialog?.type === 'deactivate' && (
        <ConfirmDialog
          title={`Deactivate ${dialog.station.name}?`}
          confirmLabel="Deactivate"
          reasonLabel="Reason for deactivating"
          busy={busy}
          error={actionError}
          onConfirm={(reason) => changeStation(dialog.station, false, reason)}
          onCancel={() => setDialog(null)}
        >
          Drivers will no longer see it on the map or be able to book it. Bookings that already exist stay confirmed
          (cancel them from the Bookings tab if needed). {dialog.station.owner_name} can still see it.
        </ConfirmDialog>
      )}

      {dialog?.type === 'reject' && (
        <ConfirmDialog
          title={`Reject ${dialog.station.name}?`}
          confirmLabel="Reject"
          reasonLabel="Reason (shown to the operator)"
          busy={busy}
          error={actionError}
          onConfirm={(reason) => review(dialog.station, 'reject', reason)}
          onCancel={() => setDialog(null)}
        >
          It stays hidden from drivers. {dialog.station.owner_name} sees your reason and can edit the station to send it
          back for approval.
        </ConfirmDialog>
      )}

      {dialog?.type === 'status' && (
        <ConfirmDialog
          title={`Set charger #${dialog.charger.id} ${dialog.status}?`}
          confirmLabel={`Set ${dialog.status}`}
          busy={busyChargerId === dialog.charger.id}
          error={actionError}
          onConfirm={() => changeChargerStatus(dialog.charger, dialog.status, true)}
          onCancel={() => setDialog(null)}
        >
          It has {plural(dialog.count, 'upcoming booking')}. {dialog.count === 1 ? 'It stays' : 'They stay'} booked, but
          no new bookings can be made while it is {dialog.status}. Cancel {dialog.count === 1 ? 'it' : 'them'} from the
          Bookings tab if needed.
        </ConfirmDialog>
      )}
    </div>
  );
}
