import L from 'leaflet';

// Leaflet 1.9 finishes a zoom animation (fitBounds, flyTo, zoom buttons) from a 250 ms timer that
// map.remove() doesn't cancel. Leaving a page mid-animation unmounts the map, and that timer then
// runs against the removed map and throws "Cannot read properties of undefined (reading
// '_leaflet_pos')". Once the map is gone (remove() deletes _mapPane) there is nothing to finish.
const finishZoomAnimation = L.Map.prototype._onZoomTransitionEnd;
if (!finishZoomAnimation.guardsRemovedMap) {
  const guarded = function onZoomTransitionEnd(...args) {
    if (!this._mapPane) {
      this._animatingZoom = false;
      return;
    }
    finishZoomAnimation.apply(this, args);
  };
  guarded.guardsRemovedMap = true;
  L.Map.include({ _onZoomTransitionEnd: guarded });
}

export const LAGOS_CENTER = [6.51, 3.42];

export function tileLayerProps() {
  const key = import.meta.env.VITE_MAPTILER_KEY;
  if (key) {
    return {
      url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`,
      attribution: '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; OpenStreetMap contributors',
    };
  }
  return {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  };
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

// A round pin. Leaflet makes the marker a focusable role="button"; `label` (e.g. the station's name
// and status) is its accessible name, as visually hidden text inside it. It goes into raw HTML, so
// it is escaped: station names are typed by operators.
export function pinIcon(color, isSelected, label = '') {
  const size = isSelected ? 26 : 16;
  const border = isSelected ? 4 : 3;
  const total = size + border * 2;
  const name = label ? `<span class="sr-only">${escapeHtml(label)}</span>` : '';
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border}px solid #ffffff;box-shadow:0 2px 6px rgba(18,33,28,0.3);">${name}</div>`,
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
    popupAnchor: [0, -total / 2],
  });
}
