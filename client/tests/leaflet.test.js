import { afterEach, describe, expect, it, vi } from 'vitest';
import L from 'leaflet';
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

describe('zoom animation after the map is removed', () => {
  it('does not throw when a pending zoom animation finishes after map.remove()', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const map = L.map(container).setView([6.5, 3.4], 11);

    // What fitBounds/flyTo leave behind mid-animation: Leaflet finishes it from a 250 ms timer.
    map._animatingZoom = true;
    map._animateToCenter = L.latLng(7.4, 3.9);
    map._animateToZoom = 9;
    map.remove(); // the page navigated away

    expect(() => map._onZoomTransitionEnd()).not.toThrow();
    container.remove();
  });
});

describe('map pins', () => {
  it('carry an escaped, screen-reader-only name', async () => {
    const { pinIcon } = await import('../src/utils/leaflet.js');
    const html = pinIcon('#0A7A45', false, 'Ada\'s <b>Hub</b>, 1 of 2 chargers online').options.html;
    expect(html).toContain('<span class="sr-only">Ada&#39;s &lt;b&gt;Hub&lt;/b&gt;, 1 of 2 chargers online</span>');
    expect(html).not.toContain('<b>');
  });
});
