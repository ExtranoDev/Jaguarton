import { useState } from 'react';
import ChargerManageRow from './ChargerManageRow.jsx';
import AddChargerForm from './AddChargerForm.jsx';
import OperatorBookingsTable from './OperatorBookingsTable.jsx';
import StationHistory from './StationHistory.jsx';
import { addCharger, setChargerStatus, topUpSlots, updateCharger } from '../../api/operator.js';

const errorMessage = (err, fallback) => err.response?.data?.error || fallback;

export default function StationPanel({ station, onChanged }) {
  const [tab, setTab] = useState('chargers');
  const [busyChargerId, setBusyChargerId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [addingCharger, setAddingCharger] = useState(false);
  const [addChargerError, setAddChargerError] = useState('');
  const [submittingCharger, setSubmittingCharger] = useState(false);
  const [slotMessage, setSlotMessage] = useState('');
  const [generatingSlots, setGeneratingSlots] = useState(false);

  async function handleStatusChange(charger, status) {
    setActionError('');
    setBusyChargerId(charger.id);
    try {
      await setChargerStatus(charger.id, status);
      await onChanged();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not update the charger status.'));
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
          ? `Added ${result.created} new slots across ${result.chargers} charger${result.chargers === 1 ? '' : 's'}.`
          : 'Every charger already has slots for the next 7 days.'
      );
      await onChanged();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not generate slots.'));
    } finally {
      setGeneratingSlots(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-grow flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="font-display text-xl font-semibold text-ink">{station.name}</h2>
          <span className="text-[13px] text-ink-2">{station.address}</span>
        </div>
        <div className="flex gap-2" role="tablist">
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
              className={`rounded-full px-4 py-2 text-[13px] ${
                tab === value ? 'bg-ink font-semibold text-white' : 'border border-border text-ink-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {station.is_active === false && (
        <p role="status" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
          An admin has deactivated this station, so drivers can&apos;t see or book it. Your chargers and bookings are unchanged.
        </p>
      )}

      {actionError && (
        <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
          {actionError}
        </p>
      )}

      {tab === 'history' && <StationHistory stationId={station.id} />}
      {tab === 'bookings' && <OperatorBookingsTable stationId={station.id} />}
      {tab === 'chargers' && (
        <div className="flex flex-col gap-2.5">
          {station.chargers.length === 0 && !addingCharger && (
            <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">
              This station has no chargers yet. Add one to start taking bookings.
            </p>
          )}

          {station.chargers.map((charger) => (
            <ChargerManageRow
              key={charger.id}
              charger={charger}
              busy={busyChargerId === charger.id}
              onStatusChange={handleStatusChange}
              onPriceSave={handlePriceSave}
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
              className="rounded-xl border-2 border-dashed border-border py-3 text-[13px] font-semibold text-ink-2 hover:border-green hover:text-green"
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
              disabled={generatingSlots || station.chargers.length === 0}
              className="rounded-lg border border-green bg-surface px-4 py-2.5 text-[13px] font-semibold text-green-dark hover:bg-green-tint disabled:opacity-50"
            >
              {generatingSlots ? 'Generating…' : 'Generate slots — next 7 days'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
