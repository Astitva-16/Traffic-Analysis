import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function FitRoute({ route }) {
  const map = useMap();
  useEffect(() => {
    if (route && Array.isArray(route) && route.length >= 2) {
      try {
        map.fitBounds(route, { padding: [40, 40] });
      } catch (e) {
        console.warn('Map fitBounds error:', e);
      }
    }
  }, [route, map]);
  return null;
}

export default function TrafficMap({ routes = [], selectedRoute = null, onSelectRoute, origin, destination }) {
  const activeRoute = selectedRoute || (routes.length ? routes[0] : null);
  const activeGeometry = activeRoute?.geometry || [];

  const fitCoordinates = activeGeometry.length > 1
    ? activeGeometry
    : (origin?.lat && destination?.lat ? [[origin.lat, origin.lon], [destination.lat, destination.lon]] : []);

  return (
    <MapContainer center={[28.615, 77.222]} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      />

      {/* Alternative routes */}
      {routes.map(r => {
        const isSelected = activeRoute && activeRoute.id === r.id;
        if (isSelected || !r.geometry || r.geometry.length < 2) return null;
        return (
          <Polyline
            key={r.id}
            positions={r.geometry}
            pathOptions={{ color: '#94a3b8', weight: 5, opacity: 0.65, dashArray: '6, 8' }}
            eventHandlers={{
              click: () => onSelectRoute && onSelectRoute(r)
            }}
          >
            <Popup>
              <b>Option #{r.rank}: {r.name}</b><br />
              Est. Time: {r.estimatedMinutes} min<br />
              Distance: {r.distanceKm} km<br />
              <button
                type="button"
                style={{ marginTop: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                onClick={() => onSelectRoute && onSelectRoute(r)}
              >
                Select this route
              </button>
            </Popup>
          </Polyline>
        );
      })}

      {/* Selected active route */}
      {activeGeometry.length > 1 && (
        <Polyline
          key={`active-${activeRoute?.id}`}
          positions={activeGeometry}
          pathOptions={{ color: '#2563eb', weight: 8, opacity: 0.95 }}
        >
          <Popup>
            <b>Selected: #{activeRoute?.rank} {activeRoute?.name}</b><br />
            Est. Time: {activeRoute?.estimatedMinutes} min<br />
            Distance: {activeRoute?.distanceKm} km<br />
            Avg Congestion: {activeRoute?.congestion}%
          </Popup>
        </Polyline>
      )}

      {/* Origin marker */}
      {origin && origin.lat != null && (
        <CircleMarker center={[origin.lat, origin.lon]} radius={10} pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1 }}>
          <Popup><b>Start Origin:</b><br />{origin.shortName || origin.name}</Popup>
        </CircleMarker>
      )}

      {/* Destination marker */}
      {destination && destination.lat != null && (
        <CircleMarker center={[destination.lat, destination.lon]} radius={10} pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 1 }}>
          <Popup><b>Destination:</b><br />{destination.shortName || destination.name}</Popup>
        </CircleMarker>
      )}

      <FitRoute route={fitCoordinates} />
    </MapContainer>
  );
}
