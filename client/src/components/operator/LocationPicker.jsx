import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { pinIcon, tileLayerProps } from '../../utils/leaflet.js';
import LocationSearch from './LocationSearch.jsx';

// Lagos, Ogun and Oyo all fit in view at this zoom, so an operator in any of them starts close.
const REGION_CENTRE = [7.35, 3.6];
const REGION_ZOOM = 8;
const PLACED_ZOOM = 16; // street level

function ClickToPlace({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

// Leaflet only measures its container when it is created, so tell it when the container changes
// size (full screen on and off).
function MapResizer({ expanded }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 50);
    return () => clearTimeout(timer);
  }, [expanded, map]);
  return null;
}

// Moves the view after a search or "use my location". Plain clicks and drags don't move it:
// the person is already looking at the spot.
function FlyTo({ focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], PLACED_ZOOM);
  }, [focus, map]);
  return null;
}

// Search an address, use your location, click the map, or drag the pin. lat/lng are plain numbers
// or null; onPick(point, label?) gets a label only when the point came from a search result.
export default function LocationPicker({ lat, lng, onPick }) {
  const tile = tileLayerProps();
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (e) => e.key === 'Escape' && setExpanded(false);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const dragHandlers = useMemo(
    () => ({
      dragend(event) {
        const { lat: newLat, lng: newLng } = event.target.getLatLng();
        onPick({ lat: newLat, lng: newLng });
      },
    }),
    [onPick]
  );

  function choose(place) {
    setFocus({ lat: place.lat, lng: place.lng });
    onPick({ lat: place.lat, lng: place.lng }, place.label);
  }

  return (
    <div className={expanded ? 'fixed inset-0 z-[900] flex flex-col gap-3 bg-paper p-2 sm:p-4' : 'flex flex-col gap-3'}>
      <LocationSearch onSelect={choose}>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="whitespace-nowrap rounded-lg border border-border px-3 py-2.5 text-[13px] font-semibold text-ink-2 hover:border-ink-2"
        >
          {expanded ? 'Close full screen' : 'Full screen'}
        </button>
      </LocationSearch>

      <div
        className={`overflow-hidden rounded-xl border border-border ${
          expanded ? 'min-h-0 flex-grow' : 'h-[55vh] min-h-[320px] lg:h-[62vh]'
        }`}
      >
        <MapContainer
          center={hasPoint ? [lat, lng] : REGION_CENTRE}
          zoom={hasPoint ? PLACED_ZOOM : REGION_ZOOM}
          className="h-full w-full"
        >
          <TileLayer url={tile.url} attribution={tile.attribution} />
          <ClickToPlace onPick={onPick} />
          <MapResizer expanded={expanded} />
          <FlyTo focus={focus} />
          {hasPoint && (
            <Marker position={[lat, lng]} icon={pinIcon('#0E8F52', true)} draggable eventHandlers={dragHandlers} />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-ink-2">
        {hasPoint
          ? 'Drag the pin, or click the map, to adjust the position.'
          : 'Search above, use your location, or click the map to drop the pin.'}
      </p>
    </div>
  );
}
