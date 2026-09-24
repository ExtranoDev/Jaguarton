import { useCallback, useEffect, useState } from 'react';
import Navbar from '../components/Navbar.jsx';
import StationPanel from '../components/operator/StationPanel.jsx';
import AddStationForm from '../components/operator/AddStationForm.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { createStation, listOperatorStations } from '../api/operator.js';

const DOT_COLORS = {
  online: 'bg-green',
  offline: 'bg-sage',
  unavailable: 'bg-terracotta',
};

// What the operator needs to know about a station at a glance.
function StationBadges({ station }) {
  const badges = [];
  if (station.archived) badges.push('archived');
  else if (station.approval_status === 'pending') badges.push('pending');
  else if (station.approval_status === 'rejected') badges.push('rejected');
  if (station.is_active === false) badges.push('deactivated');
  if (badges.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {badges.map((badge) => (
        <StatusBadge key={badge} status={badge} />
      ))}
    </span>
  );
}

// The same at-a-glance status as the badges, as text for the phone-sized station menu.
function pickerNote(station) {
  if (station.archived) return ' (archived)';
  if (station.approval_status === 'pending') return ' (pending approval)';
  if (station.approval_status === 'rejected') return ' (rejected)';
  if (station.is_active === false) return ' (deactivated)';
  return '';
}

export default function OperatorDashboardPage() {
  const [stations, setStations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingStation, setAddingStation] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const reload = useCallback(async (selectId) => {
    try {
      const list = await listOperatorStations();
      setStations(list);
      setSelectedId((current) => {
        if (selectId) return selectId;
        return list.some((s) => s.id === current) ? current : (list[0]?.id ?? null);
      });
      setError('');
    } catch {
      setError('Could not load your stations. Is the API running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCreateStation(details) {
    setCreateError('');
    setCreating(true);
    try {
      const station = await createStation(details);
      await reload(station.id);
      setAddingStation(false);
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Could not create the station.');
    } finally {
      setCreating(false);
    }
  }

  const selected = stations.find((s) => s.id === selectedId) || null;
  // Archived stations go to the bottom of the list.
  const orderedStations = [...stations].sort((a, b) => Number(Boolean(a.archived)) - Number(Boolean(b.archived)));
  const liveChargers = (station) => station.chargers.filter((c) => !c.archived);
  const chargerCount = stations.reduce((total, s) => total + liveChargers(s).length, 0);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <Navbar active="primary" />

      <main className="flex-grow overflow-y-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 pt-6 sm:px-8">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[26px] font-bold text-ink">My Stations</h1>
            <p className="text-[13px] text-ink-2">
              {stations.length} station{stations.length === 1 ? '' : 's'} · {chargerCount} charger
              {chargerCount === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAddingStation(true);
              setCreateError('');
            }}
            className="min-h-10 rounded-[10px] bg-green px-5 py-3 text-sm font-semibold text-white"
          >
            + Add Station
          </button>
        </div>

        {error && <p role="alert" className="px-4 sm:px-8 pt-4 text-sm text-terracotta">{error}</p>}
        {loading && <p className="px-4 sm:px-8 pt-6 text-sm text-ink-2">Loading…</p>}

        {!loading && !error && (
          <div className="flex flex-col gap-6 px-4 sm:px-8 pb-10 pt-5 lg:flex-row">
            {/* Phones: pick the station from a menu, so its details sit right here rather than
                below the whole list. From desktop width the list is a sidebar. */}
            {stations.length > 0 && (
              <div className="flex flex-col gap-1.5 lg:hidden">
                <label htmlFor="station-picker" className="text-[13px] font-semibold text-ink-2">
                  Station
                </label>
                <select
                  id="station-picker"
                  value={addingStation ? '' : (selectedId ?? '')}
                  onChange={(e) => {
                    setAddingStation(false);
                    setSelectedId(Number(e.target.value));
                  }}
                  className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-ink"
                >
                  {addingStation && <option value="">New station</option>}
                  {orderedStations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                      {pickerNote(station)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <nav aria-label="Your stations" className="hidden flex-col gap-2.5 lg:flex lg:w-[320px] lg:flex-shrink-0">
              {stations.length === 0 && (
                <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">
                  You haven&apos;t registered a station yet.
                </p>
              )}
              {orderedStations.map((station) => {
                const isSelected = !addingStation && station.id === selectedId;
                return (
                  <button
                    key={station.id}
                    type="button"
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => {
                      setAddingStation(false);
                      setSelectedId(station.id);
                    }}
                    className={`rounded-xl p-3.5 text-left ${
                      isSelected ? 'border-2 border-green bg-green-tint' : 'border border-border bg-surface hover:border-green'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-ink">{station.name}</span>
                    <StationBadges station={station} />
                    <span className="mb-2 mt-1 block text-xs text-ink-2">{station.address}</span>
                    <span className="flex gap-1.5" aria-label={`${liveChargers(station).length} chargers`}>
                      {liveChargers(station).length === 0 && <span className="text-[11px] text-ink-2">No chargers yet</span>}
                      {liveChargers(station).map((charger) => (
                        <span
                          key={charger.id}
                          title={charger.status}
                          className={`inline-block h-2 w-2 rounded-full ${DOT_COLORS[charger.status]}`}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </nav>

            {addingStation ? (
              // On phones the list of stations stacks above this; the form goes first so an
              // operator with many stations doesn't have to scroll past them all to reach it.
              <div className="order-first flex min-w-0 flex-grow lg:order-none">
                <AddStationForm
                  submitting={creating}
                  error={createError}
                  onSubmit={handleCreateStation}
                  onCancel={() => setAddingStation(false)}
                />
              </div>
            ) : (
              selected && <StationPanel key={selected.id} station={selected} onChanged={reload} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
