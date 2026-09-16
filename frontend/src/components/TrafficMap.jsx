import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function FitRoute({ route }) {
  const map = useMap();
  if (route?.length) {
    map.fitBounds(route, { padding: [35, 35] });
  }
  return null;
}

export default function TrafficMap({ segments, routeGeometry = [], origin, destination }) {
  const route = routeGeometry || [];
  return (
    <MapContainer center={[28.615, 77.222]} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      />
      {segments.map(s => {
        const color = s.congestion > 70 ? '#c62828' : s.congestion > 40 ? '#d97706' : '#2e7d32';
        return (
          <Polyline key={s.segmentId} positions={s.geometry} pathOptions={{ color, weight: 7, opacity: 0.85 }}>
            <Popup>
              <b>{s.name}</b><br />
              Current speed: {s.currentSpeed} km/h<br />
              Congestion: {s.congestion}%<br />
              Occupancy: {s.occupancy}%
            </Popup>
          </Polyline>
        );
      })}
      {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#1d4ed8', weight: 8, opacity: 0.9 }} />}
      {origin && (
        <CircleMarker center={[origin.lat, origin.lon]} radius={9} pathOptions={{ color: '#166534', fillOpacity: 1 }}>
          <Popup><b>Start</b><br />{origin.shortName}</Popup>
        </CircleMarker>
      )}
      {destination && (
        <CircleMarker center={[destination.lat, destination.lon]} radius={9} pathOptions={{ color: '#991b1b', fillOpacity: 1 }}>
          <Popup><b>Destination</b><br />{destination.shortName}</Popup>
        </CircleMarker>
      )}
      <FitRoute route={route.length > 1 ? route : (origin && destination ? [[origin.lat, origin.lon], [destination.lat, destination.lon]] : [])} />
    </MapContainer>
  );
}
