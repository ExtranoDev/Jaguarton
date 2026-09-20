import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { LAGOS_CENTER, pinIcon, tileLayerProps } from '../../utils/leaflet.js';

function ClickToPlace({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

// Click the map to drop the station pin. lat/lng are plain numbers or null.
export default function LocationPicker({ lat, lng, onPick }) {
  const tile = tileLayerProps();
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className="h-[260px] overflow-hidden rounded-xl border border-border">
      <MapContainer center={hasPoint ? [lat, lng] : LAGOS_CENTER} zoom={11} className="h-full w-full">
        <TileLayer url={tile.url} attribution={tile.attribution} />
        <ClickToPlace onPick={onPick} />
        {hasPoint && <Marker position={[lat, lng]} icon={pinIcon('#0E8F52', true)} />}
      </MapContainer>
    </div>
  );
}
