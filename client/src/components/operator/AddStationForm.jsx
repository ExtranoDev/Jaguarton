import { useState } from 'react';
import LocationPicker from './LocationPicker.jsx';

const round6 = (value) => Math.round(value * 1e6) / 1e6;

// Adding a station, or editing one when `station` is given (its values fill the form).
export default function AddStationForm({ submitting, error, onSubmit, onCancel, station = null }) {
  const editing = Boolean(station);
  const [form, setForm] = useState(
    editing
      ? { name: station.name, address: station.address, lat: String(station.lat), lng: String(station.lng) }
      : { name: '', address: '', lat: '', lng: '' }
  );

  const lat = form.lat === '' ? null : Number(form.lat);
  const lng = form.lng === '' ? null : Number(form.lng);
  const validLocation =
    lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const valid = form.name.trim() && form.address.trim() && validLocation;

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ name: form.name.trim(), address: form.address.trim(), lat, lng });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-grow flex-col gap-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">{editing ? `Edit ${station.name}` : 'Add a station'}</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          {editing
            ? station.approval_status === 'rejected'
              ? 'Saving sends it back to an admin for approval.'
              : station.approval_status === 'pending'
                ? 'It is still waiting for an admin to approve it.'
                : 'Drivers see the changes straight away.'
            : 'Register the location first — you’ll add its chargers next. An admin approves new stations before drivers can see them.'}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
          {error}
        </p>
      )}

      <div className="flex max-w-[720px] flex-col gap-1.5">
        <label htmlFor="station-name" className="text-[13px] font-semibold text-ink-2">
          Station name
        </label>
        <input
          id="station-name"
          type="text"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border border-border px-3.5 py-3 text-sm"
        />
      </div>

      <div className="flex max-w-[720px] flex-col gap-1.5">
        <label htmlFor="station-address" className="text-[13px] font-semibold text-ink-2">
          Address
        </label>
        <input
          id="station-address"
          type="text"
          required
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          className="rounded-lg border border-border px-3.5 py-3 text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-2">Location</span>
        <LocationPicker
          lat={lat}
          lng={lng}
          onPick={(point, label) =>
            setForm((current) => ({
              ...current,
              lat: String(round6(point.lat)),
              lng: String(round6(point.lng)),
              // A search result's name is a good first draft of the address; never overwrite one already typed.
              address: current.address.trim() === '' && label ? label : current.address,
            }))
          }
        />
        <div className="grid max-w-[720px] grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="station-lat" className="text-xs text-ink-2">
              Latitude
            </label>
            <input
              id="station-lat"
              type="number"
              step="any"
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: e.target.value })}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="station-lng" className="text-xs text-ink-2">
              Longitude
            </label>
            <input
              id="station-lng"
              type="number"
              step="any"
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!valid || submitting}
          className="rounded-lg bg-green px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {editing ? (submitting ? 'Saving…' : 'Save changes') : submitting ? 'Creating…' : 'Create station'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-5 py-3 text-sm text-ink-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
