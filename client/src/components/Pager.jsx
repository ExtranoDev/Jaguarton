// "Showing 51–100 of 120" with previous/next buttons, for any paged list. With a pager above and
// below a list, give the lower one announce={false} so screen readers hear the count once.
export default function Pager({ page, pageSize, total, onPage, label = 'results', previousLabel = '← Previous', nextLabel = 'Next →', announce = true }) {
  if (!total) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const buttonClass =
    'min-h-10 rounded-lg border border-border bg-surface px-4 text-[13px] font-semibold text-ink hover:border-green disabled:opacity-50';

  return (
    <nav aria-label={`Pages of ${label}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p role={announce ? "status" : undefined} className="text-xs text-ink-2">
        Showing {first}–{last} of {total} {label}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => onPage(page - 1)}>
            {previousLabel}
          </button>
          <span className="text-xs text-ink-2">
            Page {page} of {pages}
          </span>
          <button type="button" className={buttonClass} disabled={page >= pages} onClick={() => onPage(page + 1)}>
            {nextLabel}
          </button>
        </div>
      )}
    </nav>
  );
}
