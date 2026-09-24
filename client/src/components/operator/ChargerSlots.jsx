import { useEffect, useState } from 'react';
import { getSlots, setSlotBlocked } from '../../api/slots.js';
import { dayLabel, formatTime, nextDays } from '../../utils/format.js';

const DAYS = 7;

// An operator's view of one charger's slots for a day: block a slot so nobody can book it, or
// unblock it again. Booked and already-started slots can't be changed here.
export default function ChargerSlots({ charger }) {
  const days = nextDays(DAYS);
  const [date, setDate] = useState(days[0]);
  const [slots, setSlots] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSlots(null);
    getSlots(charger.id, date)
      .then((result) => !cancelled && setSlots(result))
      .catch(() => !cancelled && setError('Could not load the slots for this day.'));
    return () => {
      cancelled = true;
    };
  }, [charger.id, date]);

  async function toggle(slot) {
    setBusyId(slot.id);
    setError('');
    try {
      const updated = await setSlotBlocked(slot.id, slot.status !== 'blocked');
      setSlots((current) => current.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change this slot.');
    } finally {
      setBusyId(null);
    }
  }

  const now = Date.now();
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div role="group" aria-label={`Day for charger ${charger.id}'s slots`} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((day, index) => {
          const value = day;
          const active = value === date;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setDate(value)}
              className={`min-h-10 flex-shrink-0 rounded-full px-3.5 text-xs ${
                active ? 'bg-ink font-semibold text-white' : 'border border-border bg-surface text-ink-2'
              }`}
            >
              {dayLabel(day, index)}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-sm text-terracotta">
          {error}
        </p>
      )}
      {!slots && !error && <p className="text-sm text-ink-2">Loading slots…</p>}
      {slots?.length === 0 && <p className="text-sm text-ink-2">No slots on this day. Use “Generate slots” below to add them.</p>}
      {slots?.length > 0 && (
        <ul aria-label={`Slots for charger ${charger.id}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {slots.map((slot) => {
            const started = new Date(slot.start_time).getTime() <= now;
            const locked = slot.status === 'booked' || started;
            const label = started ? 'Started' : slot.status === 'booked' ? 'Booked' : slot.status === 'blocked' ? 'Unblock' : 'Block';
            return (
              <li key={slot.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                <span className={`text-sm ${slot.status === 'blocked' ? 'text-terracotta line-through' : 'text-ink'}`}>
                  {formatTime(slot.start_time)}
                </span>
                <button
                  type="button"
                  disabled={locked || busyId === slot.id}
                  aria-label={`${label} ${formatTime(slot.start_time)}`}
                  onClick={() => toggle(slot)}
                  className={`min-h-10 rounded-md px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none ${
                    locked ? 'text-ink-2' : slot.status === 'blocked' ? 'text-green-dark' : 'text-terracotta'
                  }`}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
