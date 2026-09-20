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
  const chargerCount = stations.reduce((total, s) => total + s.chargers.length, 0);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper">
      <Navbar active="primary" />

      <div className="flex-grow overflow-y-auto">
        <div className="flex items-start justify-between gap-4 px-8 pt-6">
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
            className="rounded-[10px] bg-green px-5 py-3 text-sm font-semibold text-white"
          >
            + Add Station
          </button>
        </div>

        {error && <p role="alert" className="px-8 pt-4 text-sm text-terracotta">{error}</p>}
        {loading && <p className="px-8 pt-6 text-sm text-ink-2">Loading…</p>}

        {!loading && !error && (
          <div className="flex flex-col gap-6 px-8 pb-10 pt-5 lg:flex-row">
            <nav aria-label="Your stations" className="flex flex-col gap-2.5 lg:w-[320px] lg:flex-shrink-0">
              {stations.length === 0 && (
                <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">
                  You haven&apos;t registered a station yet.
                </p>
              )}
              {stations.map((station) => {
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
                    {station.is_active === false && (
                      <span className="mt-1 block">
                        <StatusBadge status="deactivated" />
                      </span>
                    )}
                    <span className="mb-2 mt-1 block text-xs text-ink-2">{station.address}</span>
                    <span className="flex gap-1.5" aria-label={`${station.chargers.length} chargers`}>
                      {station.chargers.length === 0 && <span className="text-[11px] text-ink-2">No chargers yet</span>}
                      {station.chargers.map((charger) => (
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
              <AddStationForm
                submitting={creating}
                error={createError}
                onSubmit={handleCreateStation}
                onCancel={() => setAddingStation(false)}
              />
            ) : (
              selected && <StationPanel key={selected.id} station={selected} onChanged={reload} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
