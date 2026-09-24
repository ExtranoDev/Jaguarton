import { useState } from 'react';
import { getSlotCoverage, topUpSlots } from '../../api/admin.js';
import { CONNECTOR_LABELS, formatDayCompact, formatDayShort } from '../../utils/format.js';
import StatusBadge from '../StatusBadge.jsx';
import { EmptyState, ErrorBanner, LoadState, fieldClass } from './ui.jsx';
import useAdminData, { errorMessage } from './useAdminData.js';

export default function CoverageTab() {
  const [days, setDays] = useState(7);
  const [gapsOnly, setGapsOnly] = useState(false);
  const { data: coverage, error, reload } = useAdminData(() => getSlotCoverage(days), String(days), 'Could not load slot coverage.');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  async function fillGaps() {
    setBusy(true);
    setMessage('');
    setActionError('');
    try {
      const result = await topUpSlots(days);
      setMessage(
        result.created > 0
          ? `Added ${result.created} new slots across ${result.chargers} charger${result.chargers === 1 ? '' : 's'}.`
          : `Every charger already has slots for the next ${days} days.`
      );
      reload();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not generate slots.'));
    } finally {
      setBusy(false);
    }
  }

  const chargers = (coverage?.chargers || []).filter((charger) => !gapsOnly || charger.gapDays > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl bg-sage-tint p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-ink">
            {coverage
              ? coverage.summary.gapDays === 0
                ? `No gaps: every charger has slots for the next ${coverage.days} days.`
                : `${coverage.summary.chargersWithGaps} of ${coverage.summary.chargers} chargers have days with no slots.`
              : 'Checking slot coverage…'}
          </span>
          <span className="text-xs text-ink-2">
            A gap is a day with no slots at all. Filling creates hourly slots, 08:00–20:00, and never touches booked or
            blocked ones.
          </span>
          {message && (
            <span role="status" className="text-xs font-semibold text-green-dark">
              {message}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={fillGaps}
          disabled={busy || !coverage}
          className="rounded-lg border border-green bg-surface px-4 py-2.5 text-[13px] font-semibold text-green-dark hover:bg-green-tint disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none"
        >
          {busy ? 'Generating…' : `Fill gaps — next ${days} days`}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <select aria-label="Days to check" value={days} onChange={(e) => setDays(Number(e.target.value))} className={fieldClass}>
          <option value={7}>Next 7 days</option>
          <option value={14}>Next 14 days</option>
          <option value={30}>Next 30 days</option>
        </select>
        <label className="flex min-h-10 items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} className="h-5 w-5 accent-green" />
          Only chargers with gaps
        </label>
      </div>

      <LoadState data={coverage} error={error}>
        {actionError && <ErrorBanner>{actionError}</ErrorBanner>}
        {chargers.length === 0 && <EmptyState>{gapsOnly ? 'No chargers have gaps.' : 'There are no chargers yet.'}</EmptyState>}
        <ul className="flex flex-col gap-2.5">
          {chargers.map((charger) => (
            <li key={charger.chargerId} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-ink">
                    {charger.stationName} · Charger #{charger.chargerId}
                  </span>
                  <span className="text-[11px] text-ink-2">
                    {CONNECTOR_LABELS[charger.connectorType]} · {charger.powerKw} kW
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!charger.stationActive && <StatusBadge status="deactivated" />}
                  <StatusBadge status={charger.status} />
                </div>
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label={`Daily slots for charger ${charger.chargerId}`}>
                {charger.days.map((day) => (
                  <li
                    key={day.date}
                    title={`${formatDayShort(day.date)}: ${day.slots} slots`}
                    className={`flex min-w-[52px] flex-col items-center rounded-lg px-2 py-1.5 ${
                      day.gap ? 'bg-terracotta-tint text-terracotta' : 'bg-sage-tint text-ink-2'
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase">{formatDayCompact(day.date)}</span>
                    <span className="text-sm font-bold">{day.slots}</span>
                    {day.gap && <span className="sr-only">gap: no slots</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </LoadState>
    </div>
  );
}
