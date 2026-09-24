import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';

export default function AuthLayout({ mode, children }) {
  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="relative hidden w-[560px] flex-col overflow-hidden bg-green-dark p-14 text-white lg:flex">
        <svg
          className="absolute -left-16 top-10 opacity-[0.08]"
          width="260"
          height="260"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="#D4FF3D" strokeWidth="0.6" />
        </svg>
        <svg
          className="absolute -right-20 top-[420px] rotate-[18deg] opacity-[0.06]"
          width="320"
          height="320"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="#D4FF3D" strokeWidth="0.5" />
        </svg>

        <Link to="/" className="flex items-center gap-2.5">
          <Logo size={40} tone="dark" />
          <span className="font-display text-xl font-bold">EChargeFind</span>
        </Link>

        <div className="flex flex-grow flex-col justify-center gap-5 max-w-[400px]">
          {/* The page's h1 is the form's heading; this is the pitch beside it. */}
          <p className="font-display text-[42px] font-semibold leading-tight">
            Find, check, and book EV charging in seconds.
          </p>
          <p className="text-base leading-relaxed text-[#CFE9DC]">
            Live availability, transparent pricing, and instant confirmations across Lagos, Ogun
            and Oyo charging stations.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-4">
            <div className="flex flex-col gap-1">
              <span className="font-display text-3xl font-bold text-volt">33</span>
              <span className="text-[13px] text-[#CFE9DC]">Stations</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-display text-3xl font-bold text-volt">82</span>
              <span className="text-[13px] text-[#CFE9DC]">Chargers</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="whitespace-nowrap font-display text-3xl font-bold text-volt">08:00–20:00</span>
              <span className="text-[13px] text-[#CFE9DC]">Daily booking hours</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-[#CFE9DC]">
          Engineering Internal Hackathon — EV Charging Finder &amp; Booking
        </p>
      </aside>

      <main className="flex flex-grow flex-col items-center justify-center gap-6 px-4 py-8 sm:p-6">
        {/* Phones and tablets don't get the side panel, so the brand goes above the card. */}
        <div className="flex flex-col items-center gap-2 text-center lg:hidden">
          <div className="flex items-center gap-2">
            <Logo size={40} />
            <span className="font-display text-xl font-bold text-ink">EChargeFind</span>
          </div>
          <p className="text-sm text-ink-2">Find and book EV charging · 08:00–20:00 daily</p>
        </div>
        <div className="w-full max-w-[440px] rounded-[20px] border border-border bg-surface p-6 shadow-xl sm:p-10">
          <nav aria-label="Log in or sign up" className="flex gap-6 border-b border-border">
            <Link
              to="/login"
              aria-current={mode === 'login' ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center pb-2 text-sm ${
                mode === 'login'
                  ? '-mb-px border-b-2 border-green font-semibold text-ink'
                  : 'text-ink-2'
              }`}
            >
              Log in
            </Link>
            <Link
              to="/signup"
              aria-current={mode === 'signup' ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center pb-2 text-sm ${
                mode === 'signup'
                  ? '-mb-px border-b-2 border-green font-semibold text-ink'
                  : 'text-ink-2'
              }`}
            >
              Sign up
            </Link>
          </nav>

          {children}
        </div>
      </main>
    </div>
  );
}
