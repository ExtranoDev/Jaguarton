// Address search for the station location picker. Uses MapTiler's geocoder when a key is
// configured (the same key the map tiles use), and OpenStreetMap's public Nominatim service
// otherwise. Nominatim asks for light use, so search runs on an explicit submit, never as-you-type.
// Both are limited to Nigeria and nudged toward the Lagos / Ogun / Oyo corridor.
const NIGERIA = 'ng';
const CORRIDOR_CENTRE = { lng: 3.6, lat: 7.3 };
const MAX_RESULTS = 5;

async function getJson(url, signal) {
  let response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Search is unavailable right now. Check your connection and try again.');
  }
  if (!response.ok) throw new Error('Search is unavailable right now. Try again in a moment.');
  return response.json();
}

async function searchMapTiler(query, key, signal) {
  const params = new URLSearchParams({
    key,
    country: NIGERIA,
    limit: String(MAX_RESULTS),
    proximity: `${CORRIDOR_CENTRE.lng},${CORRIDOR_CENTRE.lat}`,
    language: 'en',
  });
  const data = await getJson(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params}`, signal);
  return (data.features || []).map((feature) => {
    const [lng, lat] = feature.center || feature.geometry.coordinates;
    return { label: feature.place_name, lat, lng };
  });
}

async function searchNominatim(query, signal) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    countrycodes: NIGERIA,
    limit: String(MAX_RESULTS),
  });
  const data = await getJson(`https://nominatim.openstreetmap.org/search?${params}`, signal);
  return data.map((place) => ({ label: place.display_name, lat: Number(place.lat), lng: Number(place.lon) }));
}

// Resolves to [{ label, lat, lng }, ...]; rejects with a message that is safe to show.
export async function searchPlaces(query, { signal } = {}) {
  const text = query.trim();
  if (text.length < 2) return [];
  const key = import.meta.env.VITE_MAPTILER_KEY;
  const places = key ? await searchMapTiler(text, key, signal) : await searchNominatim(text, signal);
  return places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
}

// Wraps the browser's geolocation in a promise with messages a person can act on.
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser can't share your location. Search for the address instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === 1
              ? 'Location access was blocked. Allow it in your browser, or search for the address instead.'
              : "Couldn't work out your location. Search for the address instead."
          )
        ),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
