import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function FitRoute({ route }) {
  const map = useMap();
  useEffect(() => {
    if (route && Array.isArray(route) && route.length >= 2) {
      try {
        map.fitBounds(route, { padding: [35, 35] });
      } catch (e) {
        console.warn('Map fitBounds failed:', e);
      }
    }
  }, [route, map]);
  return null;
}

export default function TrafficMap({ segments = [], routeGeometry = [], origin, destination }) {
  const route = routeGeometry || [];
  const validSegments = Array.isArray(segments) ? segments.filter(s => s && s.geometry && s.geometry.length > 0) : [];

  const fitBoundsCoordinates = route.length > 1
    ? route
    : (origin?.lat && destination?.lat ? [[origin.lat, origin.lon], [destination.lat, destination.lon]] : []);

  return (
    <MapContainer center={[28.615, 77.222]} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      />
      {validSegments.map(s => {
        const congestion = s.congestion ?? 0;
        const color = congestion > 70 ? '#c62828' : congestion > 40 ? '#d97706' : '#2e7d32';
        return (
          <Polyline key={s.segmentId} positions={s.geometry} pathOptions={{ color, weight: 7, opacity: 0.85 }}>
            <Popup>
              <b>{s.name}</b><br />
              Current speed: {s.currentSpeed != null ? Number(s.currentSpeed).toFixed(1) : '—'} km/h<br />
              Congestion: {Math.round(congestion)}%<br />
              Occupancy: {s.occupancy != null ? Math.round(s.occupancy) : '—'}%<br />
              Volume: {s.volume != null ? s.volume : '—'} veh/hr
            </Popup>
          </Polyline>
        );
      })}
      {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#1d4ed8', weight: 8, opacity: 0.9 }} />}
      {origin && origin.lat != null && (
        <CircleMarker center={[origin.lat, origin.lon]} radius={9} pathOptions={{ color: '#166534', fillOpacity: 1 }}>
          <Popup><b>Start:</b><br />{origin.shortName || origin.name}</Popup>
        </CircleMarker>
      )}
      {destination && destination.lat != null && (
        <CircleMarker center={[destination.lat, destination.lon]} radius={9} pathOptions={{ color: '#991b1b', fillOpacity: 1 }}>
          <Popup><b>Destination:</b><br />{destination.shortName || destination.name}</Popup>
        </CircleMarker>
      )}
      <FitRoute route={fitBoundsCoordinates} />
    </MapContainer>
  );
}
