import { useState } from 'react';

const CONNECTORS = [
  { value: 'Type2_AC', label: 'Type 2 · AC', defaultKw: 22 },
  { value: 'CCS2_DC', label: 'CCS2 · DC Fast', defaultKw: 50 },
  { value: 'CHAdeMO_DC', label: 'CHAdeMO · DC Fast', defaultKw: 50 },
];

export default function AddChargerForm({ submitting, error, onSubmit, onCancel }) {
  const [connectorType, setConnectorType] = useState('CCS2_DC');
  const [powerKw, setPowerKw] = useState('50');
  const [pricePerKwh, setPricePerKwh] = useState('');

  function changeConnector(value) {
    setConnectorType(value);
    setPowerKw(String(CONNECTORS.find((c) => c.value === value).defaultKw));
  }

  // The API wants a price above 0 (and at most 100,000) and power above 0 (at most 1000 kW).
  const valid = Number(powerKw) > 0 && Number(powerKw) <= 1000 && pricePerKwh !== '' && Number(pricePerKwh) > 0 && Number(pricePerKwh) <= 100000;

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ connectorType, powerKw: Number(powerKw), pricePerKwh: Number(pricePerKwh) });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border-2 border-dashed border-border bg-surface p-4"
    >
      <h3 className="font-display text-sm font-semibold text-ink">Add a charger</h3>

      {error && (
        <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="connector" className="text-[13px] font-semibold text-ink-2">
            Connector
          </label>
          <select
            id="connector"
            value={connectorType}
            onChange={(e) => changeConnector(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
          >
            {CONNECTORS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="power" className="text-[13px] font-semibold text-ink-2">
            Power (kW)
          </label>
          <input
            id="power"
            type="number"
            min="1"
            step="any"
            value={powerKw}
            onChange={(e) => setPowerKw(e.target.value)}
            className="rounded-lg border border-border px-3 py-2.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="price" className="text-[13px] font-semibold text-ink-2">
            Price (₦ per kWh)
          </label>
          <input
            id="price"
            type="number"
            min="0.01"
            step="0.01"
            value={pricePerKwh}
            onChange={(e) => setPricePerKwh(e.target.value)}
            className="rounded-lg border border-border px-3 py-2.5 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!valid || submitting}
          className="rounded-lg bg-green px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none"
        >
          {submitting ? 'Adding…' : 'Add charger'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2.5 text-sm text-ink-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
