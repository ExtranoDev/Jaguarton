import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import AuditLogTab from '../components/admin/AuditLogTab.jsx';
import BookingsTab from '../components/admin/BookingsTab.jsx';
import CoverageTab from '../components/admin/CoverageTab.jsx';
import OverviewTab from '../components/admin/OverviewTab.jsx';
import StationsTab from '../components/admin/StationsTab.jsx';
import UsersTab from '../components/admin/UsersTab.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', Panel: OverviewTab },
  { id: 'users', label: 'Users', Panel: UsersTab },
  { id: 'stations', label: 'Stations', Panel: StationsTab },
  { id: 'bookings', label: 'Bookings', Panel: BookingsTab },
  { id: 'coverage', label: 'Slot coverage', Panel: CoverageTab },
  { id: 'audit', label: 'Audit log', Panel: AuditLogTab },
];

export default function AdminDashboardPage() {
  // The tab lives in the URL (?tab=users) so a refresh or a shared link lands on the same one.
  const [searchParams, setSearchParams] = useSearchParams();
  const active = TABS.find((tab) => tab.id === searchParams.get('tab')) || TABS[0];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <Navbar active="primary" />

      <main className="flex-grow overflow-y-auto">
        <div className="flex flex-col gap-1 px-4 pt-6 sm:px-8">
          <h1 className="font-display text-[26px] font-bold text-ink">Admin</h1>
          <p className="text-[13px] text-ink-2">Accounts, stations, bookings and slot supply across EChargeFind.</p>
        </div>

        <div className="px-4 pt-4 sm:px-8">
          {/* Phones: a 3 x 2 grid, so every section is in view without scrolling sideways. */}
          <div role="tablist" aria-label="Admin sections" className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`admin-tab-${tab.id}`}
                aria-selected={active.id === tab.id}
                aria-controls="admin-panel"
                onClick={() => setSearchParams(tab.id === 'overview' ? {} : { tab: tab.id })}
                className={`min-h-10 whitespace-nowrap rounded-full px-2 text-[13px] sm:px-4 ${
                  active.id === tab.id ? 'bg-ink font-semibold text-white' : 'border border-border text-ink-2'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div
          id="admin-panel"
          role="tabpanel"
          aria-labelledby={`admin-tab-${active.id}`}
          className="px-4 pb-10 pt-5 sm:px-8"
        >
          <h2 className="sr-only">{active.label}</h2>
          <active.Panel key={active.id} />
        </div>
      </main>
    </div>
  );
}
