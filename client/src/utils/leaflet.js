import L from 'leaflet';

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

export function pinIcon(color, isSelected) {
  const size = isSelected ? 26 : 16;
  const border = isSelected ? 4 : 3;
  const total = size + border * 2;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border}px solid #ffffff;box-shadow:0 2px 6px rgba(18,33,28,0.3);"></div>`,
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
    popupAnchor: [0, -total / 2],
  });
}
