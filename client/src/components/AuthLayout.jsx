import { Link } from 'react-router-dom';

export default function AuthLayout({ mode, children }) {
  return (
    <div className="flex min-h-screen bg-paper">
      <div className="relative hidden w-[560px] flex-col overflow-hidden bg-green-dark p-14 text-white lg:flex">
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
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-volt shadow-glow-volt">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="#1C2B12" />
            </svg>
          </div>
          <span className="font-display text-xl font-bold">EChargeFind</span>
        </Link>

        <div className="flex flex-grow flex-col justify-center gap-5 max-w-[400px]">
          <h1 className="font-display text-[42px] font-semibold leading-tight">
            Find, check, and book EV charging in seconds.
          </h1>
          <p className="text-base leading-relaxed text-[#CFE9DC]">
            Live availability, transparent pricing, and instant confirmations across Lagos charging
            stations.
          </p>
          <div className="mt-3 flex gap-10">
            <div className="flex flex-col gap-1">
              <span className="font-display text-3xl font-bold text-volt">13</span>
              <span className="text-[13px] text-[#CFE9DC]">Stations</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-display text-3xl font-bold text-volt">32</span>
              <span className="text-[13px] text-[#CFE9DC]">Chargers</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-display text-3xl font-bold text-volt">24/7</span>
              <span className="text-[13px] text-[#CFE9DC]">Booking</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-[#CFE9DC] opacity-60">
          Engineering Internal Hackathon — EV Charging Finder &amp; Booking
        </p>
      </div>

      <div className="flex flex-grow items-center justify-center p-6">
        <div className="w-full max-w-[440px] rounded-[20px] border border-border bg-surface p-10 shadow-xl">
          <div className="flex gap-6 border-b border-border">
            <Link
              to="/login"
              className={`pb-3 text-sm ${
                mode === 'login'
                  ? '-mb-px border-b-2 border-green font-semibold text-ink'
                  : 'text-ink-2'
              }`}
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className={`pb-3 text-sm ${
                mode === 'signup'
                  ? '-mb-px border-b-2 border-green font-semibold text-ink'
                  : 'text-ink-2'
              }`}
            >
              Sign up
            </Link>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
