import { useState } from 'react';
import { listAuditLog } from '../../api/admin.js';
import { CATEGORY_LABELS, actionLabel, describeChanges, describeDetails } from '../../utils/audit.js';
import { formatDateTimeFull } from '../../utils/format.js';
import Pager from '../Pager.jsx';
import StatusBadge from '../StatusBadge.jsx';
import DataTable from './DataTable.jsx';
import { EmptyState, LoadState } from './ui.jsx';
import useAdminData, { useDebounced } from './useAdminData.js';

const PAGE_SIZE = 50;
// Full width inside the filter grid at every size.
const filterClass = 'w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink';
const EMPTY_FILTERS = { actor: '', action: '', category: '', target: '', from: '', to: '' };

function Person({ person }) {
  if (!person) return <span className="text-ink-2">—</span>;
  return (
    <div className="flex flex-col items-end sm:items-start">
      <span className="text-ink">{person.name || person.email || 'Unknown'}</span>
      {person.name && person.email && <span className="break-all text-[11px] text-ink-2">{person.email}</span>}
      {person.role && (
        <span className="mt-0.5">
          <StatusBadge status={person.role} />
        </span>
      )}
    </div>
  );
}

function Details({ entry }) {
  const changes = describeChanges(entry.changes);
  const details = describeDetails(entry);
  const lines = [...changes, ...(details ? [details] : [])];
  return (
    <div className="flex max-w-xs flex-col items-end gap-0.5 sm:items-start">
      {entry.reason && (
        <span className="text-ink">
          <span className="font-semibold">Reason:</span> {entry.reason}
        </span>
      )}
      {lines.map((line) => (
        <span key={line} className="text-ink-2">
          {line}
        </span>
      ))}
      {entry.ip && <span className="text-[11px] text-ink-2">IP {entry.ip}</span>}
      {!entry.reason && lines.length === 0 && !entry.ip && <span className="text-ink-2">—</span>}
    </div>
  );
}

const columns = [
  { key: 'when', header: 'When (WAT)', cell: (entry) => <span className="whitespace-nowrap">{formatDateTimeFull(entry.created_at)}</span> },
  { key: 'who', header: 'Who', cell: (entry) => <Person person={entry.actor} /> },
  {
    key: 'action',
    header: 'Action',
    cell: (entry) => (
      <div className="flex flex-col items-end sm:items-start">
        <span className="font-semibold text-ink">{actionLabel(entry.action)}</span>
        <span className="text-[11px] text-ink-2">{CATEGORY_LABELS[entry.category] || entry.category}</span>
      </div>
    ),
  },
  {
    key: 'target',
    header: 'Target',
    cell: (entry) =>
      entry.target ? (
        <div className="flex flex-col items-end sm:items-start">
          <span className="text-ink">{entry.target.name || `${entry.target.type} #${entry.target.id}`}</span>
          {entry.target.email && <span className="break-all text-[11px] text-ink-2">{entry.target.email}</span>}
        </div>
      ) : (
        <span className="text-ink-2">—</span>
      ),
  },
  { key: 'details', header: 'Details', cell: (entry) => <Details entry={entry} /> },
];

function Filter({ id, label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-bold uppercase text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function AuditLogTab() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  // Free-text boxes wait until typing pauses; the selects and dates apply straight away.
  const actor = useDebounced(filters.actor.trim());
  const target = useDebounced(filters.target.trim());
  const query = { ...filters, actor, target, page, pageSize: PAGE_SIZE };
  const { data, error } = useAdminData(() => listAuditLog(query), JSON.stringify(query), 'Could not load the audit log.');

  const set = (field) => (e) => {
    setFilters({ ...filters, [field]: e.target.value });
    setPage(1);
  };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <form role="search" aria-label="Filter the audit log" onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Filter id="audit-actor" label="Who">
          <input id="audit-actor" type="search" placeholder="Name or email" value={filters.actor} onChange={set('actor')} className={filterClass} />
        </Filter>
        <Filter id="audit-category" label="Kind">
          <select id="audit-category" value={filters.category} onChange={set('category')} className={filterClass}>
            <option value="">All kinds</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Filter>
        <Filter id="audit-action" label="Action">
          <select id="audit-action" value={filters.action} onChange={set('action')} className={filterClass}>
            <option value="">All actions</option>
            {(data?.actions || []).map((action) => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
          </select>
        </Filter>
        <Filter id="audit-target" label="Target">
          <input id="audit-target" type="search" placeholder="Name, email or reference" value={filters.target} onChange={set('target')} className={filterClass} />
        </Filter>
        <Filter id="audit-from" label="From">
          <input id="audit-from" type="date" value={filters.from} max={filters.to || undefined} onChange={set('from')} className={filterClass} />
        </Filter>
        <Filter id="audit-to" label="To">
          <input id="audit-to" type="date" value={filters.to} min={filters.from || undefined} onChange={set('to')} className={filterClass} />
        </Filter>
      </form>
      {filtered && (
        <button
          type="button"
          onClick={() => {
            setFilters(EMPTY_FILTERS);
            setPage(1);
          }}
          className="min-h-10 self-start rounded-lg px-1 text-[13px] font-semibold text-green-dark underline"
        >
          Clear filters
        </button>
      )}

      <LoadState data={data} error={error}>
        {data?.total === 0 ? (
          <EmptyState>{filtered ? 'Nothing in the audit log matches those filters.' : 'Nothing has been recorded yet.'}</EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            <Pager page={data?.page || 1} pageSize={PAGE_SIZE} total={data?.total} onPage={setPage} label="entries, newest first" previousLabel="← Newer" nextLabel="Older →" />
            <DataTable label="Audit log" columns={columns} rows={data?.entries || []} getKey={(entry) => entry.id} />
            <Pager page={data?.page || 1} pageSize={PAGE_SIZE} total={data?.total} onPage={setPage} label="entries, newest first" previousLabel="← Newer" nextLabel="Older →" announce={false} />
          </div>
        )}
      </LoadState>
    </div>
  );
}
