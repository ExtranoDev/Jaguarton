import { useEffect, useId, useRef, useState } from 'react';

// Modal confirmation for destructive admin actions. Pass `reasonLabel` to also require a
// written reason before the confirm button enables (used for cancelling bookings).
// Cancel is the initially focused control, so Enter can't confirm by accident.
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  reasonLabel,
  busy = false,
  error = '',
  onConfirm,
  onCancel,
}) {
  const [reason, setReason] = useState('');
  const titleId = useId();
  const reasonId = useId();
  const formRef = useRef(null);
  const initialFocus = useRef(null);
  const needsReason = Boolean(reasonLabel);
  const canConfirm = !busy && (!needsReason || reason.trim().length > 0);

  useEffect(() => {
    const opener = document.activeElement;
    initialFocus.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  // Keep Tab inside the dialog while it is open.
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusable = formRef.current.querySelectorAll('textarea, button:not(:disabled)');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function submit(e) {
    e.preventDefault();
    if (canConfirm) onConfirm(reason.trim());
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        ref={formRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        onKeyDown={trapFocus}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-5 shadow-xl"
      >
        <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
          {title}
        </h2>
        <div className="text-sm text-ink-2">{children}</div>

        {needsReason && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-[13px] font-semibold text-ink-2">
              {reasonLabel}
            </label>
            <textarea
              id={reasonId}
              ref={initialFocus}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none rounded-lg border border-border px-3.5 py-2.5 text-sm text-ink"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            ref={needsReason ? undefined : initialFocus}
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2.5 text-[13px] font-semibold text-ink-2 hover:border-ink-2 disabled:opacity-60"
          >
            Go back
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            className="rounded-lg bg-terracotta px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
