import { useState } from 'react';
import ChargerManageRow from './ChargerManageRow.jsx';
import AddChargerForm from './AddChargerForm.jsx';
import AddStationForm from './AddStationForm.jsx';
import OperatorBookingsTable from './OperatorBookingsTable.jsx';
import StationHistory from './StationHistory.jsx';
import ConfirmDialog from '../admin/ConfirmDialog.jsx';
import {
  addCharger,
  setChargerArchived,
  setChargerStatus,
  setStationArchived,
  topUpSlots,
  updateCharger,
  updateStation,
} from '../../api/operator.js';

const errorMessage = (err, fallback) => err.response?.data?.error || fallback;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Banner({ tone = 'warn', children }) {
  const tones = {
    warn: 'bg-terracotta-tint text-terracotta',
    info: 'bg-sage-tint text-ink',
  };
  return (
    <div role="status" className={`flex flex-col gap-2 rounded-lg px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${tones[tone]}`}>
      {children}
    </div>
  );
}

const headerButton = 'min-h-10 rounded-lg border px-3.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none';

export default function StationPanel({ station, onChanged }) {
  const [tab, setTab] = useState('chargers');
  const [busyChargerId, setBusyChargerId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [addingCharger, setAddingCharger] = useState(false);
  const [addChargerError, setAddChargerError] = useState('');
  const [submittingCharger, setSubmittingCharger] = useState(false);
  const [slotMessage, setSlotMessage] = useState('');
  const [generatingSlots, setGeneratingSlots] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  // { charger, status, count }: the server asked to confirm taking a booked charger offline.
  const [statusConfirm, setStatusConfirm] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  async function handleStatusChange(charger, status, confirm = false) {
    setActionError('');
    setBusyChargerId(charger.id);
    try {
      await setChargerStatus(charger.id, status, confirm);
      setStatusConfirm(null);
      await onChanged();
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.code === 'CONFIRM_REQUIRED') {
        setStatusConfirm({ charger, status, count: data.upcomingBookings });
      } else {
        setActionError(errorMessage(err, 'Could not update the charger status.'));
        setStatusConfirm(null);
      }
    } finally {
      setBusyChargerId(null);
    }
  }

  async function handlePriceSave(charger, pricePerKwh) {
    setActionError('');
    setBusyChargerId(charger.id);
    try {
      await updateCharger(charger.id, {
        connectorType: charger.connector_type,
        powerKw: charger.power_kw,
        pricePerKwh,
      });
      await onChanged();
      return true;
    } catch (err) {
      setActionError(errorMessage(err, 'Could not update the price.'));
      return false;
    } finally {
      setBusyChargerId(null);
    }
  }

  async function handleArchiveCharger(charger, archived) {
    setActionError('');
    setBusyChargerId(charger.id);
    try {
      await setChargerArchived(charger.id, archived);
      await onChanged();
    } catch (err) {
      setActionError(errorMessage(err, archived ? 'Could not archive the charger.' : 'Could not restore the charger.'));
    } finally {
      setBusyChargerId(null);
    }
  }

  async function handleArchiveStation(archived) {
    setBusy(true);
    setDialogError('');
    setActionError('');
    try {
      await setStationArchived(station.id, archived);
      setArchiveConfirm(false);
      await onChanged();
    } catch (err) {
      const message = errorMessage(err, archived ? 'Could not archive the station.' : 'Could not restore the station.');
      if (archiveConfirm) setDialogError(message);
      else setActionError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEditStation(details) {
    setEditError('');
    setSaving(true);
    try {
      await updateStation(station.id, details);
      await onChanged();
      setEditing(false);
    } catch (err) {
      setEditError(errorMessage(err, 'Could not save the station.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCharger(details) {
    setAddChargerError('');
    setSubmittingCharger(true);
    try {
      await addCharger(station.id, details);
      await onChanged();
      setAddingCharger(false);
    } catch (err) {
      setAddChargerError(errorMessage(err, 'Could not add the charger.'));
    } finally {
      setSubmittingCharger(false);
    }
  }

  async function handleGenerateSlots() {
    setActionError('');
    setSlotMessage('');
    setGeneratingSlots(true);
    try {
      const result = await topUpSlots({ days: 7, stationId: station.id });
      setSlotMessage(
        result.created > 0
          ? `Added ${result.created} new slots across ${plural(result.chargers, 'charger')}.`
          : 'Every charger already has slots for the next 7 days.'
      );
      await onChanged();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not generate slots.'));
    } finally {
      setGeneratingSlots(false);
    }
  }

  if (editing) {
    return (
      <div className="flex min-w-0 flex-grow">
        <AddStationForm
          station={station}
          submitting={saving}
          error={editError}
          onSubmit={handleEditStation}
          onCancel={() => {
            setEditing(false);
            setEditError('');
          }}
        />
      </div>
    );
  }

  const activeChargers = station.chargers.filter((c) => !c.archived);
  const archivedChargers = station.chargers.filter((c) => c.archived);

  return (
    <div className="flex min-w-0 flex-grow flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="font-display text-xl font-semibold text-ink">{station.name}</h2>
          <span className="text-[13px] text-ink-2">{station.address}</span>
        </div>
        {!station.archived && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className={`${headerButton} border-green text-green-dark hover:bg-green-tint`}>
              Edit station
            </button>
            <button
              type="button"
              onClick={() => {
                setDialogError('');
                setArchiveConfirm(true);
              }}
              className={`${headerButton} border-border text-ink-2 hover:border-terracotta hover:text-terracotta`}
            >
              Archive station
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Station sections">
        {[
          ['chargers', 'Chargers'],
          ['bookings', 'Bookings'],
          ['history', 'History'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-10 rounded-full px-4 text-[13px] ${
              tab === value ? 'bg-ink font-semibold text-white' : 'border border-border text-ink-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {station.approval_status === 'pending' && !station.archived && (
        <Banner tone="info">
          Waiting for an admin to approve this station. Drivers can&apos;t see it yet; you can add chargers and slots
          meanwhile.
        </Banner>
      )}
      {station.approval_status === 'rejected' && !station.archived && (
        <Banner>
          <span>
            An admin rejected this station{station.review_note ? `: “${station.review_note}”` : '.'} Edit it to send it
            back for approval.
          </span>
        </Banner>
      )}
      {station.archived && (
        <Banner tone="info">
          <span>Archived: hidden from drivers and closed to bookings. Its bookings and history are kept.</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleArchiveStation(false)}
            className={`${headerButton} flex-shrink-0 border-green bg-surface text-green-dark hover:bg-green-tint`}
          >
            Restore station
          </button>
        </Banner>
      )}
      {station.is_active === false && (
        <Banner>
          An admin has deactivated this station, so drivers can&apos;t see or book it. Your chargers and bookings are unchanged.
        </Banner>
      )}

      {actionError && (
        <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
          {actionError}
        </p>
      )}

      {tab === 'history' && <StationHistory stationId={station.id} />}
      {tab === 'bookings' && <OperatorBookingsTable stationId={station.id} />}
      {tab === 'chargers' && station.archived && (
        <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">
          Restore the station to manage its {plural(station.chargers.length, 'charger')} again.
        </p>
      )}
      {tab === 'chargers' && !station.archived && (
        <div className="flex flex-col gap-2.5">
          {activeChargers.length === 0 && !addingCharger && (
            <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">
              This station has no chargers yet. Add one to start taking bookings.
            </p>
          )}

          {activeChargers.map((charger) => (
            <ChargerManageRow
              key={charger.id}
              charger={charger}
              busy={busyChargerId === charger.id}
              onStatusChange={handleStatusChange}
              onPriceSave={handlePriceSave}
              onArchive={handleArchiveCharger}
            />
          ))}

          {addingCharger ? (
            <AddChargerForm
              submitting={submittingCharger}
              error={addChargerError}
              onSubmit={handleAddCharger}
              onCancel={() => {
                setAddingCharger(false);
                setAddChargerError('');
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingCharger(true)}
              className="min-h-10 rounded-xl border-2 border-dashed border-border py-3 text-[13px] font-semibold text-ink-2 hover:border-green hover:text-green-dark"
            >
              + Add Charger
            </button>
          )}

          <div className="mt-3 flex flex-col gap-2 rounded-xl bg-sage-tint p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">Availability</span>
              <span className="text-xs text-ink-2">
                Slots are hourly, 08:00–20:00. Booked and blocked slots are never changed.
              </span>
              {slotMessage && (
                <span role="status" className="mt-1 text-xs font-semibold text-green-dark">
                  {slotMessage}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleGenerateSlots}
              disabled={generatingSlots || activeChargers.length === 0}
              className="min-h-10 rounded-lg border border-green bg-surface px-4 py-2.5 text-[13px] font-semibold text-green-dark hover:bg-green-tint disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none"
            >
              {generatingSlots ? 'Generating…' : 'Generate slots — next 7 days'}
            </button>
          </div>

          {archivedChargers.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold text-ink-2">Archived chargers</h3>
              {archivedChargers.map((charger) => (
                <ChargerManageRow
                  key={charger.id}
                  charger={charger}
                  busy={busyChargerId === charger.id}
                  onStatusChange={handleStatusChange}
                  onPriceSave={handlePriceSave}
                  onArchive={handleArchiveCharger}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {statusConfirm && (
        <ConfirmDialog
          title={`Set charger #${statusConfirm.charger.id} ${statusConfirm.status}?`}
          confirmLabel={`Set ${statusConfirm.status}`}
          busy={busyChargerId === statusConfirm.charger.id}
          onConfirm={() => handleStatusChange(statusConfirm.charger, statusConfirm.status, true)}
          onCancel={() => setStatusConfirm(null)}
        >
          It has {plural(statusConfirm.count, 'upcoming booking')}. {statusConfirm.count === 1 ? 'It stays' : 'They stay'} booked,
          but no new bookings can be made while it is {statusConfirm.status}. Cancel{' '}
          {statusConfirm.count === 1 ? 'it' : 'them'} from the Bookings tab if the driver can&apos;t charge.
        </ConfirmDialog>
      )}

      {archiveConfirm && (
        <ConfirmDialog
          title={`Archive ${station.name}?`}
          confirmLabel="Archive"
          busy={busy}
          error={dialogError}
          onConfirm={() => handleArchiveStation(true)}
          onCancel={() => setArchiveConfirm(false)}
        >
          Drivers will no longer see it or be able to book it. Its chargers, bookings and history are kept, and you can
          restore it at any time. A station with upcoming bookings can&apos;t be archived until they are cancelled.
        </ConfirmDialog>
      )}
    </div>
  );
}
