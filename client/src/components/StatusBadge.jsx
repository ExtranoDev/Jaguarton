const STYLES = {
  online: 'bg-green-tint text-green-dark',
  offline: 'bg-sage-tint text-ink-2',
  unavailable: 'bg-terracotta-tint text-terracotta',
  confirmed: 'bg-green-tint text-green-dark',
  cancelled: 'bg-terracotta-tint text-terracotta',
  active: 'bg-green-tint text-green-dark',
  suspended: 'bg-terracotta-tint text-terracotta',
  deactivated: 'bg-terracotta-tint text-terracotta',
  driver: 'bg-sage-tint text-ink-2',
  operator: 'bg-sage-tint text-ink-2',
  admin: 'bg-volt text-volt-ink',
};

const LABELS = {
  online: 'Online',
  offline: 'Offline',
  unavailable: 'Unavailable',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  active: 'Active',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
  driver: 'Driver',
  operator: 'Operator',
  admin: 'Admin',
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STYLES[status] || STYLES.offline}`}
    >
      {LABELS[status] || status}
    </span>
  );
}
