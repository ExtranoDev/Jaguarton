import { useState } from 'react';
import { listUsers, setUserActive } from '../../api/admin.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../StatusBadge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import DataTable from './DataTable.jsx';
import { EmptyState, ErrorBanner, LoadState, RowButton, fieldClass, wideFieldClass } from './ui.jsx';
import useAdminData, { errorMessage, useDebounced } from './useAdminData.js';

export default function UsersTab() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const { data: users, error, reload } = useAdminData(() => listUsers({ role, q }), `${role}|${q}`, 'Could not load users.');
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  async function apply(user, isActive) {
    setBusy(true);
    setActionError('');
    try {
      await setUserActive(user.id, isActive);
      setConfirming(null);
      reload();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not update this account.'));
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'user',
      header: 'User',
      cell: (user) => (
        <div className="flex flex-col">
          <span className="font-semibold text-ink">{user.name}</span>
          <span className="break-all text-[11px] text-ink-2">{user.email}</span>
        </div>
      ),
    },
    { key: 'role', header: 'Role', cell: (user) => <StatusBadge status={user.role} /> },
    {
      key: 'status',
      header: 'Status',
      cell: (user) => <StatusBadge status={user.is_active ? 'active' : 'suspended'} />,
    },
    {
      key: 'joined',
      header: 'Joined',
      cell: (user) => new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    {
      key: 'action',
      header: 'Action',
      mobileLabel: '',
      cell: (user) => {
        if (user.id === me?.id) return <span className="text-[13px] text-ink-2">This is you</span>;
        return user.is_active ? (
          <RowButton
            danger
            aria-label={`Suspend ${user.name}`}
            onClick={() => {
              setActionError('');
              setConfirming(user);
            }}
          >
            Suspend
          </RowButton>
        ) : (
          <RowButton aria-label={`Reactivate ${user.name}`} disabled={busy} onClick={() => apply(user, true)}>
            Reactivate
          </RowButton>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)} className={fieldClass}>
          <option value="">All roles</option>
          <option value="driver">Drivers</option>
          <option value="operator">Operators</option>
          <option value="admin">Admins</option>
        </select>
        <input
          type="search"
          aria-label="Search users"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={wideFieldClass}
        />
      </div>

      <LoadState data={users} error={error}>
        {actionError && !confirming && <ErrorBanner>{actionError}</ErrorBanner>}
        {users?.length === 0 ? (
          <EmptyState>No users match those filters.</EmptyState>
        ) : (
          <DataTable label="Users" columns={columns} rows={users || []} getKey={(user) => user.id} />
        )}
      </LoadState>

      {confirming && (
        <ConfirmDialog
          title={`Suspend ${confirming.name}?`}
          confirmLabel="Suspend"
          busy={busy}
          error={actionError}
          onConfirm={() => apply(confirming, false)}
          onCancel={() => setConfirming(null)}
        >
          They will be signed out straight away and can&apos;t log in until you reactivate them. Their bookings and
          stations stay as they are.
        </ConfirmDialog>
      )}
    </div>
  );
}
