import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS, homeFor } from '../utils/roles.js';

const PRIMARY_LABELS = { admin: 'Admin', operator: 'My Stations' };

function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// On phones the links drop to a second row under the logo and account chip.
const linkClass = (isActive) =>
  isActive
    ? 'whitespace-nowrap border-b-2 border-green pb-2 text-sm font-semibold text-green sm:-mb-6 sm:pb-6'
    : 'whitespace-nowrap pb-2 text-sm text-ink-2 sm:pb-0';

export default function Navbar({ active }) {
  const { user, logout } = useAuth();

  const primaryLink = { to: homeFor(user), label: PRIMARY_LABELS[user?.role] || 'Map' };

  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 border-b border-border bg-surface px-4 sm:h-[72px] sm:flex-nowrap sm:gap-x-12 sm:px-8">
      <Link to={primaryLink.to} className="flex items-center gap-2.5 py-3 sm:py-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-green shadow-glow-green">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="#D4FF3D" />
          </svg>
        </div>
        <span className="font-display text-[19px] font-bold text-ink">EChargeFind</span>
      </Link>

      <div className="order-last flex w-full items-center gap-6 sm:order-none sm:w-auto sm:gap-7">
        <Link to={primaryLink.to} className={linkClass(active === 'primary')}>
          {primaryLink.label}
        </Link>
        {user?.role === 'driver' && (
          <Link to="/bookings" className={linkClass(active === 'bookings')}>
            My Bookings
          </Link>
        )}
      </div>

      <div className="flex-grow" />

      {user && (
        <div className="flex items-center gap-3">
          <Link to="/account" aria-label="Account settings" title="Account settings" className="flex items-center gap-2 rounded-lg hover:opacity-80">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-sage-tint text-xs font-bold text-ink-2"
              title={user.name}
            >
              {initials(user.name)}
            </div>
            <div className="hidden flex-col leading-tight sm:flex">
              <span className="text-[13px] font-semibold text-ink">{user.name}</span>
              <span className="self-start rounded bg-green-tint px-1.5 py-0.5 text-[11px] text-green-dark">
                {ROLE_LABELS[user.role] || 'Driver'}
              </span>
            </div>
          </Link>
          <button
            type="button"
            aria-label="Log out"
            onClick={logout}
            className="rounded p-1.5 text-ink-2 hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
