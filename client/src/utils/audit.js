import { formatDateTimeFull, formatNaira } from './format.js';

// Readable names for audit log actions. Unknown actions fall back to the raw name.
export const ACTION_LABELS = {
  'auth.signup': 'Signed up',
  'auth.login': 'Logged in',
  'auth.login_failed': 'Failed login',
  'auth.lockout': 'Login locked (too many failures)',
  'auth.login_suspended': 'Login refused (suspended)',
  'auth.password_change': 'Changed own password',
  'auth.profile_update': 'Updated own profile',
  'user.create': 'Created user',
  'user.update': 'Edited user',
  'user.reset_password': 'Reset password',
  'user.suspend': 'Suspended user',
  'user.reactivate': 'Reactivated user',
  'station.create': 'Added station',
  'station.update': 'Edited station',
  'station.deactivate': 'Deactivated station',
  'station.activate': 'Reactivated station',
  'station.approve': 'Approved station',
  'station.reject': 'Rejected station',
  'station.archive': 'Archived station',
  'station.unarchive': 'Restored station',
  'charger.create': 'Added charger',
  'charger.update': 'Edited charger',
  'charger.status': 'Changed charger status',
  'charger.archive': 'Archived charger',
  'charger.unarchive': 'Restored charger',
  // Older entries, from before charger status changes were one action.
  'charger.set_online': 'Set charger online',
  'charger.set_offline': 'Set charger offline',
  'charger.set_unavailable': 'Set charger unavailable',
  'slots.generate': 'Generated slots',
  'slots.top_up': 'Filled slot gaps',
  'slot.block': 'Blocked slot',
  'slot.unblock': 'Unblocked slot',
  'slot.delete': 'Deleted slot',
  'booking.create': 'Booked',
  'booking.cancel': 'Cancelled booking',
};

export const CATEGORY_LABELS = {
  security: 'Security',
  operator: 'Operator changes',
  booking: 'Bookings',
  admin: 'Admin actions',
};

export const actionLabel = (action) => ACTION_LABELS[action] || action;

const FIELD_LABELS = {
  name: 'Name',
  email: 'Email',
  role: 'Role',
  address: 'Address',
  lat: 'Latitude',
  lng: 'Longitude',
  status: 'Status',
  is_active: 'Active',
  connector_type: 'Connector',
  power_kw: 'Power (kW)',
  price_per_kwh: 'Price per kWh',
  approval_status: 'Approval',
  archived: 'Archived',
};

const show = (field, value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (field === 'price_per_kwh') return formatNaira(value);
  return String(value);
};

// ["Status: online → offline", ...] for an entry's before -> after values.
export function describeChanges(changes) {
  if (!changes) return [];
  return Object.entries(changes).map(([field, { from, to }]) =>
    from === null || from === undefined
      ? `${FIELD_LABELS[field] || field}: ${show(field, to)}`
      : `${FIELD_LABELS[field] || field}: ${show(field, from)} → ${show(field, to)}`
  );
}

// A short line for the extra facts an entry carries.
export function describeDetails(entry) {
  const d = entry.details;
  if (!d) return null;
  switch (entry.action) {
    case 'slots.generate':
      return `${d.created} slot${d.created === 1 ? '' : 's'} for ${d.date}`;
    case 'slots.top_up':
      return `${d.created} new slot${d.created === 1 ? '' : 's'} over ${d.days} day${d.days === 1 ? '' : 's'}`;
    case 'booking.create':
    case 'booking.cancel':
      return d.startTime ? `Slot ${formatDateTimeFull(d.startTime)}` : null;
    case 'user.reset_password':
      return d.method ? `${d.method[0].toUpperCase()}${d.method.slice(1)}` : null;
    case 'auth.login_failed':
      return d.knownAccount ? 'Wrong password' : 'No account with this email';
    case 'auth.lockout':
      return `${d.failures} failures in ${d.minutes} minutes`;
    case 'charger.status':
      return d.upcomingBookings ? `${d.upcomingBookings} upcoming booking${d.upcomingBookings === 1 ? '' : 's'} affected` : null;
    default:
      return null;
  }
}
