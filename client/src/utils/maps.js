// Opens turn-by-turn directions to a station in the person's own maps app (Google Maps on the
// web and Android, and it hands off to Apple Maps on iOS when that is the default).
export function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${Number(lat)},${Number(lng)}`;
}
