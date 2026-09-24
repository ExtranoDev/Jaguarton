import { useState } from 'react';
import { getOverview } from '../../api/admin.js';
import { formatDayCompact, formatDayShort } from '../../utils/format.js';
import { LoadState } from './ui.jsx';
import useAdminData from './useAdminData.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const rateText = (rate) => (rate == null ? 'no bookable slots' : `${rate}%`);

function StatTile({ label, value, children }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
      <span className="text-[11px] font-bold uppercase text-ink-2">{label}</span>
      <span className="font-body text-3xl font-bold text-ink">{value}</span>
      <span className="text-xs text-ink-2">{children}</span>
    </div>
  );
}

// One series, so no legend: the card title says what is plotted. Each column is a button so
// hover, keyboard focus and a tap on a phone all show the same detail line under the chart;
// the table view carries every value for anyone who doesn't want to hover.
function UtilisationChart({ utilisation }) {
  // Hover and tap/focus are separate: touch browsers fire a synthetic mouseleave right after a
  // tap, which must not clear the day the reader just picked.
  const [hoverIndex, setHoverIndex] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const activeIndex = hoverIndex ?? pinnedIndex;
  const [showTable, setShowTable] = useState(false);
  const { days } = utilisation;

  const dayLabel = (day, index) => (index === 0 ? 'Today' : formatDayCompact(day.date));
  const detail = (booked, open, rate, label) =>
    `${label}: ${booked} booked of ${plural(booked + open, 'bookable slot')} (${rateText(rate)})`;

  const active = activeIndex == null ? null : days[activeIndex];
  const readout = active
    ? detail(active.booked, active.open, active.rate, formatDayShort(active.date))
    : detail(utilisation.booked, utilisation.open, utilisation.rate, 'Next 7 days');

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="utilisation-title">
      <div className="flex flex-col gap-0.5">
        <h3 id="utilisation-title" className="text-sm font-semibold text-ink">
          Slot utilisation, next 7 days
        </h3>
        <p className="text-xs text-ink-2">
          Booked slots as a share of bookable slots. Blocked slots, and slots on offline chargers or deactivated stations,
          don&apos;t count.
        </p>
      </div>

      <div className="relative mt-7 h-32 pl-9">
        {[100, 50, 0].map((tick) => (
          <div key={tick} className="absolute inset-x-0" style={{ bottom: `${tick}%` }}>
            <span className="absolute -top-2 left-0 w-7 text-right text-[10px] text-ink-2">{tick}%</span>
            <div className="ml-9 border-t border-border" />
          </div>
        ))}
        <ul className="absolute inset-y-0 left-9 right-0 flex gap-1.5 sm:gap-3">
          {days.map((day, index) => (
            <li key={day.date} className="relative flex-1">
              <button
                type="button"
                aria-label={detail(day.booked, day.open, day.rate, formatDayShort(day.date))}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setPinnedIndex(index)}
                onBlur={() => setPinnedIndex(null)}
                onClick={() => setPinnedIndex(index)}
                className="group absolute inset-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-green"
              >
                <span
                  className="absolute inset-x-0 text-center text-[11px] font-semibold text-ink-2"
                  style={{ bottom: `calc(${day.rate ?? 0}% + 4px)` }}
                >
                  {day.rate == null ? '–' : `${Math.round(day.rate)}%`}
                </span>
                {day.rate != null && (
                  <span
                    className={`absolute bottom-0 left-1/2 w-full max-w-[24px] -translate-x-1/2 rounded-t-[4px] bg-green group-hover:brightness-90 ${
                      activeIndex === index ? 'brightness-90' : ''
                    }`}
                    style={{ height: `${day.rate}%` }}
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <ul className="flex gap-1.5 pl-9 sm:gap-3" aria-hidden="true">
        {days.map((day, index) => (
          <li key={day.date} className="flex-1 text-center text-[10px] leading-tight text-ink-2 sm:text-[11px]">
            {dayLabel(day, index)}
          </li>
        ))}
      </ul>

      <p aria-live="polite" className="text-[13px] font-semibold text-ink">
        {readout}
      </p>

      <button
        type="button"
        aria-expanded={showTable}
        onClick={() => setShowTable((shown) => !shown)}
        className="min-h-10 self-start text-[13px] font-semibold text-green-dark underline underline-offset-2"
      >
        {showTable ? 'Hide table' : 'Show as table'}
      </button>
      {showTable && (
        <div className="overflow-x-auto">
          <table aria-label="Utilisation by day" className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-sage-tint">
                {['Day', 'Booked', 'Open', 'Utilisation'].map((header) => (
                  <th key={header} scope="col" className="px-3 py-2 text-left text-[11px] font-bold uppercase text-ink-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date} className="border-t border-border">
                  <td className="px-3 py-2 text-ink">{formatDayShort(day.date)}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{day.booked}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{day.open}</td>
                  <td className="px-3 py-2 tabular-nums text-ink">{day.rate == null ? '–' : `${day.rate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function OverviewTab() {
  const { data: overview, error } = useAdminData(getOverview, 'overview', 'Could not load the overview.');

  return (
    <LoadState data={overview} error={error}>
      {overview && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Users" value={overview.users.total}>
              {plural(overview.users.drivers, 'driver')} · {plural(overview.users.operators, 'operator')} · {plural(overview.users.admins, 'admin')}
              {overview.users.suspended > 0 && <span className="block text-terracotta">{overview.users.suspended} suspended</span>}
            </StatTile>
            <StatTile label="Active stations" value={overview.stations.active}>
              of {overview.stations.total}
              {overview.stations.inactive > 0 && <span className="block text-terracotta">{overview.stations.inactive} deactivated</span>}
              {overview.stations.pending > 0 && <span className="block font-semibold text-ink">{overview.stations.pending} waiting for approval</span>}
            </StatTile>
            <StatTile label="Chargers online" value={overview.chargers.online}>
              of {overview.chargers.total} · {overview.chargers.offline} offline · {overview.chargers.unavailable} unavailable
            </StatTile>
            <StatTile label="Upcoming bookings" value={overview.bookings.upcoming}>
              {overview.bookings.confirmed} confirmed · {overview.bookings.cancelled} cancelled, all time
            </StatTile>
          </div>
          <UtilisationChart utilisation={overview.utilisation} />
        </div>
      )}
    </LoadState>
  );
}
