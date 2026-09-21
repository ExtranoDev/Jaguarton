import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import SlotPicker from '../components/SlotPicker.jsx';
import BookingSummary from '../components/BookingSummary.jsx';
import { getStation } from '../api/stations.js';
import { getSlots } from '../api/slots.js';
import { createBooking } from '../api/bookings.js';
import { useAuth } from '../context/AuthContext.jsx';
import { CONNECTOR_LABELS, nextDays, toLocalDateString } from '../utils/format.js';
import { directionsUrl } from '../utils/maps.js';

const DAYS_SHOWN = 3;

export default function StationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const days = useMemo(() => nextDays(DAYS_SHOWN), []);
  const [station, setStation] = useState(null);
  const [error, setError] = useState('');

  const [selectedChargerId, setSelectedChargerId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(days[0]));
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getStation(id)
      .then((data) => {
        if (cancelled) return;
        setStation(data);
        const firstOnline = data.chargers.find((c) => c.status === 'online');
        setSelectedChargerId(firstOnline ? firstOnline.id : null);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this station.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!selectedChargerId) {
      setSlots([]);
      return undefined;
    }
    let cancelled = false;
    setSlotsLoading(true);
    getSlots(selectedChargerId, selectedDate)
      .then((data) => {
        if (!cancelled) setSlots(data);
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
          setBookingError('Could not load time slots. Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedChargerId, selectedDate, refreshKey]);

  const selectedCharger = station?.chargers.find((c) => c.id === selectedChargerId) || null;
  const selectedSlot = slots.find((s) => s.id === selectedSlotId) || null;

  function selectCharger(chargerId) {
    setSelectedChargerId(chargerId);
    setSelectedSlotId(null);
    setBookingError('');
  }

  function selectDate(date) {
    setSelectedDate(date);
    setSelectedSlotId(null);
    setBookingError('');
  }

  function selectSlot(slot) {
    setSelectedSlotId(slot.id);
    setBookingError('');
  }

  async function handleBook() {
    if (!selectedSlot) return;
    setBookingError('');
    setSubmitting(true);
    try {
      const booking = await createBooking(selectedSlot.id);
      navigate(`/bookings/${booking.id}/confirmation`);
    } catch (err) {
      if (err.response?.status === 409) {
        // Someone else got there first (or the charger went offline): drop the
        // stale selection and reload the grid so the taken slot shows as booked.
        setBookingError(
          `${err.response.data?.error || 'That slot is no longer available'}. We've refreshed the times — please pick another.`
        );
        setSelectedSlotId(null);
        setRefreshKey((key) => key + 1);
      } else {
        setBookingError(err.response?.data?.error || 'Could not complete the booking. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper">
      <Navbar active="primary" />

      <div className="overflow-y-auto">
        <div className="px-8 pt-5">
          <Link to="/" className="text-[13px] text-ink-2">
            ← Back to map
          </Link>
        </div>

        {error && <p className="px-8 py-6 text-sm text-terracotta">{error}</p>}

        {station && (
          <>
            <div className="flex items-start justify-between gap-6 px-8 py-5">
              <div className="flex flex-col gap-2">
                <h1 className="font-display text-[32px] font-bold text-ink">{station.name}</h1>
                <p className="text-[15px] text-ink-2">{station.address}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-sage-tint px-2.5 py-1 text-xs text-ink-2">
                    {station.chargers.filter((c) => c.status === 'online').length} of{' '}
                    {station.chargers.length} chargers online
                  </span>
                  <a
                    href={directionsUrl(station.lat, station.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-green px-3 py-1 text-xs font-semibold text-green-dark hover:bg-green-tint"
                  >
                    Get directions ↗
                  </a>
                </div>
              </div>
              <div className="hidden h-[100px] w-40 flex-shrink-0 items-center justify-center rounded-2xl bg-sage-tint sm:flex">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#0E8F52">
                  <path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
                </svg>
              </div>
            </div>

            <div className="flex flex-col gap-8 px-8 pb-10 lg:flex-row">
              <div className="flex flex-col gap-4 lg:w-[560px] lg:flex-shrink-0">
                <h2 className="text-lg font-semibold text-ink">Chargers</h2>
                <div className="flex flex-col gap-3">
                  {station.chargers.map((charger) => {
                    const online = charger.status === 'online';
                    const selected = charger.id === selectedChargerId;
                    return (
                      <button
                        key={charger.id}
                        type="button"
                        disabled={!online}
                        aria-pressed={selected}
                        onClick={() => selectCharger(charger.id)}
                        className={`flex items-center justify-between rounded-2xl border p-4 text-left ${
                          selected
                            ? 'border-2 border-green bg-green-tint'
                            : online
                              ? 'border-border bg-surface hover:border-green'
                              : 'cursor-not-allowed border-border bg-surface opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-[10px] text-[10px] font-bold ${
                              selected ? 'border border-green bg-surface text-green-dark' : 'bg-sage-tint text-ink-2'
                            }`}
                          >
                            {charger.connector_type.split('_')[0]}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-semibold text-ink">
                              {CONNECTOR_LABELS[charger.connector_type] || charger.connector_type}
                            </span>
                            <span className="text-xs text-ink-2">{charger.power_kw} kW</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-base font-bold text-ink">₦{charger.price_per_kwh}/kWh</span>
                          <StatusBadge status={charger.status} />
                          {online && (
                            <span className="text-[11px] text-ink-2">
                              {charger.availableSlotCount} slot{charger.availableSlotCount === 1 ? '' : 's'}{' '}
                              open
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!selectedCharger && (
                  <p className="rounded-xl bg-sage-tint p-4 text-sm text-ink-2">
                    No chargers at this station are online right now.
                  </p>
                )}
              </div>

              {selectedCharger && (
                <div className="flex min-w-0 flex-grow flex-col gap-5">
                  <SlotPicker
                    chargerLabel={CONNECTOR_LABELS[selectedCharger.connector_type]}
                    days={days}
                    selectedDate={selectedDate}
                    onDateChange={selectDate}
                    slots={slots}
                    loading={slotsLoading}
                    selectedSlotId={selectedSlotId}
                    onSelectSlot={selectSlot}
                  />
                  <BookingSummary
                    station={station}
                    charger={selectedCharger}
                    slot={selectedSlot}
                    canBook={user?.role === 'driver'}
                    submitting={submitting}
                    error={bookingError}
                    onBook={handleBook}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
