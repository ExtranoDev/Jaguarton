import { dayLabel, formatTime } from '../utils/format.js';

function slotState(slot, selectedSlotId, now) {
  if (slot.id === selectedSlotId) return 'selected';
  if (slot.status !== 'available') return 'taken';
  if (new Date(slot.start_time).getTime() <= now) return 'passed';
  return 'available';
}

const SLOT_STYLES = {
  selected: 'border-2 border-green bg-green font-bold text-white',
  available: 'border border-green text-ink hover:bg-green-tint',
  taken: 'cursor-not-allowed border border-border bg-sage-tint text-ink-2',
  passed: 'cursor-not-allowed border border-dashed border-border bg-sage-tint text-ink-2 line-through',
};

const STATE_LABELS = {
  selected: 'selected',
  available: 'available',
  taken: 'booked',
  passed: 'already started',
};

export default function SlotPicker({
  chargerLabel,
  days,
  selectedDate,
  onDateChange,
  slots,
  loading,
  selectedSlotId,
  onSelectSlot,
}) {
  const now = Date.now();

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex min-w-0 flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">Choose a time — {chargerLabel}</h2>
        {/* A week of days (Lagos time): scrolls sideways when it doesn't fit. */}
        <div role="group" aria-label="Day" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((day, index) => {
            const active = day === selectedDate;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                onClick={() => onDateChange(day)}
                className={`min-h-10 flex-shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] ${
                  active ? 'bg-green font-semibold text-white' : 'border border-border text-ink-2 hover:border-green'
                }`}
              >
                {dayLabel(day, index)}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <p className="text-sm text-ink-2">Loading slots…</p>}

      {!loading && slots.length === 0 && (
        <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">
          No slots available for this day.
        </p>
      )}

      {!loading && slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {slots.map((slot) => {
            const state = slotState(slot, selectedSlotId, now);
            const disabled = state === 'taken' || state === 'passed';
            return (
              <button
                key={slot.id}
                type="button"
                disabled={disabled}
                aria-pressed={state === 'selected'}
                aria-label={`${formatTime(slot.start_time)}, ${STATE_LABELS[state]}`}
                onClick={() => onSelectSlot(slot)}
                className={`min-h-10 rounded-[10px] py-2.5 text-[13px] ${SLOT_STYLES[state]}`}
              >
                {formatTime(slot.start_time)}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-green" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-green" />
          Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-border bg-sage-tint" />
          Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed border-ink-2 bg-sage-tint" />
          Started
        </span>
      </div>
    </div>
  );
}
