import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { LAGOS_CENTER, pinIcon, tileLayerProps } from '../utils/leaflet.js';

function colorForStation(station) {
  const chargers = station.chargers || [];
  if (chargers.some((c) => c.status === 'online')) return '#0E8F52';
  if (chargers.every((c) => c.status === 'unavailable')) return '#B4482A';
  return '#9AA39C';
}

export default function MapView({ stations, selectedStationId }) {
  const tile = tileLayerProps();

  return (
    <MapContainer center={LAGOS_CENTER} zoom={11} className="h-full w-full" scrollWheelZoom>
      <TileLayer url={tile.url} attribution={tile.attribution} />
      {stations
        .filter((s) => s.lat != null && s.lng != null)
        .map((station) => {
          const isSelected = station.id === selectedStationId;
          return (
            <Marker
              key={station.id}
              position={[Number(station.lat), Number(station.lng)]}
              icon={pinIcon(colorForStation(station), isSelected)}
            >
              <Popup>
                <div className="flex min-w-[180px] flex-col gap-1">
                  <span className="text-sm font-semibold text-ink">{station.name}</span>
                  <span className="text-xs text-ink-2">
                    {(station.chargers || []).length} charger
                    {(station.chargers || []).length === 1 ? '' : 's'}
                  </span>
                  <Link to={`/stations/${station.id}`} className="mt-1 text-sm font-semibold text-green">
                    View details →
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
