import { afterEach, describe, expect, it, vi } from 'vitest';
import { tileLayerProps } from '../src/utils/leaflet.js';

afterEach(() => vi.unstubAllEnvs());

describe('tileLayerProps', () => {
  it('uses MapTiler when VITE_MAPTILER_KEY is set', () => {
    vi.stubEnv('VITE_MAPTILER_KEY', 'abc123');

    const { url, attribution } = tileLayerProps();

    expect(url).toBe('https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=abc123');
    expect(attribution).toContain('MapTiler');
  });

  it('falls back to OpenStreetMap when the key is empty', () => {
    vi.stubEnv('VITE_MAPTILER_KEY', '');

    const { url, attribution } = tileLayerProps();

    expect(url).toContain('tile.openstreetmap.org');
    expect(attribution).not.toContain('MapTiler');
  });
});
