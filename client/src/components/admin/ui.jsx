// Small pieces shared by the admin tabs, using the same tokens as the operator dashboard.

const fieldBase = 'rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink';
// Full width on phones, natural width beside its neighbours from tablet up.
export const fieldClass = `${fieldBase} w-full sm:w-auto`;
export const wideFieldClass = `${fieldBase} w-full sm:w-72`;

// What a tab shows until its first load finishes (or fails).
export function LoadState({ data, error, children }) {
  if (!data) {
    return error ? (
      <p role="alert" className="text-sm text-terracotta">
        {error}
      </p>
    ) : (
      <p className="text-sm text-ink-2">Loading…</p>
    );
  }
  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {children}
    </>
  );
}

export function ErrorBanner({ children }) {
  return (
    <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
      {children}
    </p>
  );
}

export function EmptyState({ children }) {
  return <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">{children}</p>;
}

export function RowButton({ danger = false, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-10 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none ${
        danger
          ? 'border-terracotta text-terracotta hover:bg-terracotta-tint'
          : 'border-green text-green-dark hover:bg-green-tint'
      }`}
    >
      {children}
    </button>
  );
}
