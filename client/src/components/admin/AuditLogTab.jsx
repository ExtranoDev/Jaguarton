import { listAuditLog } from '../../api/admin.js';
import { formatDateTime } from '../../utils/format.js';
import DataTable from './DataTable.jsx';
import { EmptyState, LoadState } from './ui.jsx';
import useAdminData from './useAdminData.js';

const ACTION_LABELS = {
  'user.suspend': 'Suspended user',
  'user.reactivate': 'Reactivated user',
  'station.deactivate': 'Deactivated station',
  'station.activate': 'Reactivated station',
  'charger.set_online': 'Set charger online',
  'charger.set_offline': 'Set charger offline',
  'charger.set_unavailable': 'Set charger unavailable',
  'booking.cancel': 'Cancelled booking',
  'slots.top_up': 'Filled slot gaps',
};

const columns = [
  { key: 'when', header: 'When', cell: (entry) => formatDateTime(entry.created_at) },
  {
    key: 'admin',
    header: 'Admin',
    cell: (entry) => (
      <div className="flex flex-col">
        <span className="text-ink">{entry.admin_name}</span>
        <span className="break-all text-[11px] text-ink-2">{entry.admin_email}</span>
      </div>
    ),
  },
  {
    key: 'action',
    header: 'Action',
    cell: (entry) => <span className="font-semibold text-ink">{ACTION_LABELS[entry.action] || entry.action}</span>,
  },
  { key: 'target', header: 'Target', cell: (entry) => entry.target_label || entry.target },
  { key: 'reason', header: 'Reason', cell: (entry) => entry.reason || '—' },
];

export default function AuditLogTab() {
  const { data: actions, error } = useAdminData(listAuditLog, 'audit', 'Could not load the audit log.');

  return (
    <LoadState data={actions} error={error}>
      {actions?.length === 0 ? (
        <EmptyState>No admin actions have been recorded yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-2">The 100 most recent actions, newest first.</p>
          <DataTable label="Audit log" columns={columns} rows={actions || []} getKey={(entry) => entry.id} />
        </div>
      )}
    </LoadState>
  );
}
