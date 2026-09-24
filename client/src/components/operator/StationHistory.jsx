import { useEffect, useState } from 'react';
import { listOperatorHistory } from '../../api/operator.js';
import { actionLabel, describeChanges, describeDetails } from '../../utils/audit.js';
import { formatDateTimeFull } from '../../utils/format.js';
import DataTable from '../admin/DataTable.jsx';
import Pager from '../Pager.jsx';

const PAGE_SIZE = 50;

// Who did it, as the operator may see it: themselves, a driver with a masked email, or an admin.
function Who({ actor }) {
  if (!actor) return <span className="text-ink-2">—</span>;
  return (
    <div className="flex flex-col items-end sm:items-start">
      <span className="text-ink">{actor.name || 'Unknown'}</span>
      {actor.email && <span className="break-all text-[11px] text-ink-2">{actor.email}</span>}
    </div>
  );
}

function What({ entry }) {
  const lines = [...describeChanges(entry.changes), describeDetails(entry)].filter(Boolean);
  return (
    <div className="flex max-w-sm flex-col items-end gap-0.5 sm:items-start">
      <span className="font-semibold text-ink">{actionLabel(entry.action)}</span>
      {entry.target?.name && <span className="text-ink">{entry.target.name}</span>}
      {lines.map((line) => (
        <span key={line} className="text-ink-2">
          {line}
        </span>
      ))}
      {entry.reason && (
        <span className="text-ink">
          <span className="font-semibold">Reason:</span> {entry.reason}
        </span>
      )}
    </div>
  );
}

const columns = [
  { key: 'when', header: 'When (WAT)', cell: (entry) => <span className="whitespace-nowrap">{formatDateTimeFull(entry.created_at)}</span> },
  { key: 'what', header: 'What happened', cell: (entry) => <What entry={entry} /> },
  { key: 'who', header: 'By', cell: (entry) => <Who actor={entry.actor} /> },
];

// Read-only history of one station: changes to it, its chargers and slots, and its bookings.
export default function StationHistory({ stationId }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listOperatorHistory({ stationId, page })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError('');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the history for this station.');
      });
    return () => {
      cancelled = true;
    };
  }, [stationId, page]);

  if (error) return <p role="alert" className="text-sm text-terracotta">{error}</p>;
  if (!data) return <p className="text-sm text-ink-2">Loading history…</p>;
  if (data.total === 0) {
    return <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">Nothing has happened at this station yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-2">
        Changes to this station, its chargers and slots, and its bookings. Drivers&apos; emails are partly hidden.
      </p>
      <Pager page={data.page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} label="events, newest first" previousLabel="← Newer" nextLabel="Older →" />
      <DataTable label="Station history" columns={columns} rows={data.entries} getKey={(entry) => entry.id} />
    </div>
  );
}
