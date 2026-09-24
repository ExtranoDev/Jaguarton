import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { LAGOS_CENTER, pinIcon, tileLayerProps } from '../utils/leaflet.js';
import { directionsUrl } from '../utils/maps.js';

// Keeps the view on whatever is being listed: all the stations at first (Lagos, Ogun and Oyo),
// then just the matches as the filters or search narrow them. Stations are read from a
// coordinate signature so the map only moves when the set of pins actually changes.
function FitToStations({ stations }) {
  const map = useMap();
  const signature = stations
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => `${Number(s.lat)},${Number(s.lng)}`)
    .join(';');

  useEffect(() => {
    if (!signature) return;
    const points = signature.split(';').map((pair) => pair.split(',').map(Number));
    map.fitBounds(points, { padding: [40, 40], maxZoom: 13 });
  }, [map, signature]);

  return null;
}

function colorForStation(station) {
  const chargers = station.chargers || [];
  if (chargers.some((c) => c.status === 'online')) return '#0A7A45';
  if (chargers.every((c) => c.status === 'unavailable')) return '#A8401F';
  return '#9AA39C';
}

// What a screen reader announces for a pin: "Ikeja Charging Hub, 2 of 3 chargers online".
function markerLabel(station) {
  const chargers = station.chargers || [];
  const online = chargers.filter((c) => c.status === 'online').length;
  return `${station.name}, ${online} of ${chargers.length} charger${chargers.length === 1 ? '' : 's'} online`;
}

export default function MapView({ stations, selectedStationId }) {
  const tile = tileLayerProps();

  return (
    <MapContainer center={LAGOS_CENTER} zoom={11} className="h-full w-full" scrollWheelZoom>
      <TileLayer url={tile.url} attribution={tile.attribution} />
      <FitToStations stations={stations} />
      {stations
        .filter((s) => s.lat != null && s.lng != null)
        .map((station) => {
          const isSelected = station.id === selectedStationId;
          return (
            <Marker
              key={station.id}
              position={[Number(station.lat), Number(station.lng)]}
              icon={pinIcon(colorForStation(station), isSelected, markerLabel(station))}
              title={station.name}
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
                  <a
                    href={directionsUrl(station.lat, station.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-ink-2"
                  >
                    Get directions ↗
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
