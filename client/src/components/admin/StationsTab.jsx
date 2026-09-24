import { useState } from 'react';
import { listStations, setChargerStatus, setStationActive } from '../../api/admin.js';
import { CONNECTOR_LABELS } from '../../utils/format.js';
import StatusBadge from '../StatusBadge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { EmptyState, ErrorBanner, LoadState, RowButton } from './ui.jsx';
import useAdminData, { errorMessage } from './useAdminData.js';

const CHARGER_STATUSES = [
  { value: 'online', label: 'Online', active: 'border-green bg-green text-white' },
  { value: 'offline', label: 'Offline', active: 'border-ink-2 bg-ink-2 text-white' },
  { value: 'unavailable', label: 'Unavailable', active: 'border-terracotta bg-terracotta text-white' },
];

function ChargerRow({ charger, busy, onStatusChange }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-ink">
          {CONNECTOR_LABELS[charger.connector_type]} · {charger.power_kw} kW
        </span>
        <span className="text-[11px] text-ink-2">Charger #{charger.id}</span>
      </div>
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

export default function StationsTab() {
  const { data: stations, error, reload } = useAdminData(listStations, 'stations', 'Could not load stations.');
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyChargerId, setBusyChargerId] = useState(null);
  const [actionError, setActionError] = useState('');

  async function changeStation(station, isActive, reason) {
    setBusy(true);
    setActionError('');
    try {
      await setStationActive(station.id, isActive, reason);
      setConfirming(null);
      reload();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not update this station.'));
    } finally {
      setBusy(false);
    }
  }

  async function changeChargerStatus(charger, status) {
    setBusyChargerId(charger.id);
    setActionError('');
    try {
      await setChargerStatus(charger.id, status);
      reload();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not update the charger.'));
    } finally {
      setBusyChargerId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <LoadState data={stations} error={error}>
        {actionError && !confirming && <ErrorBanner>{actionError}</ErrorBanner>}
        {stations?.length === 0 && <EmptyState>No stations have been registered yet.</EmptyState>}
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
                </div>
                <StatusBadge status={station.is_active ? 'active' : 'deactivated'} />
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

              <div className="flex justify-end">
                {station.is_active ? (
                  <RowButton
                    danger
                    aria-label={`Deactivate ${station.name}`}
                    onClick={() => {
                      setActionError('');
                      setConfirming(station);
                    }}
                  >
                    Deactivate
                  </RowButton>
                ) : (
                  <RowButton
                    aria-label={`Reactivate ${station.name}`}
                    disabled={busy}
                    onClick={() => changeStation(station, true)}
                  >
                    Reactivate
                  </RowButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      </LoadState>

      {confirming && (
        <ConfirmDialog
          title={`Deactivate ${confirming.name}?`}
          confirmLabel="Deactivate"
          reasonLabel="Reason for deactivating"
          busy={busy}
          error={actionError}
          onConfirm={(reason) => changeStation(confirming, false, reason)}
          onCancel={() => setConfirming(null)}
        >
          Drivers will no longer see it on the map or be able to book it. Bookings that already exist stay confirmed
          (cancel them from the Bookings tab if needed). {confirming.owner_name} can still see it.
        </ConfirmDialog>
      )}
    </div>
  );
}
