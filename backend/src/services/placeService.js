const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const cache = new Map();
let lastNominatimAt = 0;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const FALLBACK_PLACES = [
  { name: 'Connaught Place, New Delhi, Delhi, India', shortName: 'Connaught Place', lat: 28.6315, lon: 77.2167 },
  { name: 'India Gate, Rajpath, New Delhi, Delhi, India', shortName: 'India Gate', lat: 28.6129, lon: 77.2295 },
  { name: 'Indira Gandhi International Airport, New Delhi, Delhi, India', shortName: 'IGI Airport', lat: 28.5562, lon: 77.1000 },
  { name: 'Red Fort, Netaji Subhash Marg, Chandni Chowk, Old Delhi, Delhi, India', shortName: 'Red Fort', lat: 28.6562, lon: 77.2410 },
  { name: 'Cyber Hub, DLF Phase 2, Gurugram, Haryana, India', shortName: 'Cyber Hub', lat: 28.4952, lon: 77.0890 },
  { name: 'Noida Sector 18, Noida, Gautam Buddha Nagar, Uttar Pradesh, India', shortName: 'Noida Sector 18', lat: 28.5708, lon: 77.3260 },
  { name: 'Saket City Centre, Saket, New Delhi, Delhi, India', shortName: 'Saket', lat: 28.5244, lon: 77.2185 },
  { name: 'Hauz Khas Village, New Delhi, Delhi, India', shortName: 'Hauz Khas', lat: 28.5535, lon: 77.1945 },
  { name: 'Lotus Temple, Bahapur, Kalkaji, New Delhi, Delhi, India', shortName: 'Lotus Temple', lat: 28.5535, lon: 77.2588 },
  { name: 'Qutub Minar, Mehrauli, New Delhi, Delhi, India', shortName: 'Qutub Minar', lat: 28.5245, lon: 77.1855 }
];

async function nominatimSearch(query) {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const wait = Math.max(0, 1000 - (Date.now() - lastNominatimAt));
  if (wait) await sleep(wait);
  lastNominatimAt = Date.now();

  try {
    const url = new URL(NOMINATIM);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    url.searchParams.set('addressdetails', '1');
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TrafficAnalysisStudentProject/1.0 (local development)' },
      signal: AbortSignal.timeout(4000)
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const results = data.map(x => ({
          name: x.display_name,
          shortName: x.name || x.display_name.split(',')[0],
          lat: Number(x.lat),
          lon: Number(x.lon),
          type: x.type,
          address: x.address || {}
        }));
        cache.set(key, results);
        return results;
      }
    }
  } catch {
    // fallback
  }

  const filtered = FALLBACK_PLACES.filter(p =>
    p.name.toLowerCase().includes(key) || p.shortName.toLowerCase().includes(key)
  );
  if (filtered.length > 0) {
    cache.set(key, filtered);
    return filtered;
  }
  return FALLBACK_PLACES.slice(0, 4);
}

export async function searchPlaces(query) {
  if (!query || query.trim().length < 2) return [];
  return nominatimSearch(query.trim());
}

async function osrmRoute(origin, destination) {
  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const url = `${OSRM}/route/v1/driving/${coords}?alternatives=true&overview=full&geometries=geojson&steps=true`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const data = await response.json();
      if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
        return data.routes;
      }
    }
  } catch (err) {
    console.warn('[Routing API] OSRM fetch error:', err.message);
  }
  return [];
}

function extractRouteName(route, index) {
  const summary = route.legs?.[0]?.summary?.trim();
  if (summary && summary.length > 2) {
    return 'Via ' + summary.split(',').map(s => s.trim()).filter(Boolean).join(' & ');
  }

  const steps = route.legs?.[0]?.steps || [];
  const roadNames = [...new Set(
    steps
      .map(s => s.name?.trim())
      .filter(n => n && n.length > 1 && !/unnamed/i.test(n))
  )];

  if (roadNames.length > 0) {
    return 'Via ' + roadNames.slice(0, 3).join(' & ');
  }

  return `Route Corridor ${index + 1}`;
}

function extractRouteSegments(route) {
  const steps = route.legs?.[0]?.steps || [];
  const segments = [];
  let cumDist = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const distKm = (step.distance || 0) / 1000;
    // Skip negligible zero-distance maneuvers except at ends
    if (distKm <= 0.02 && i > 0 && i < steps.length - 1) continue;
    cumDist += distKm;

    const speed = step.duration > 0
      ? Math.min(85, Math.max(12, Math.round((step.distance / step.duration) * 3.6)))
      : 35;

    const rawName = step.name?.trim();
    const road = (rawName && rawName.length > 1 && !/unnamed/i.test(rawName))
      ? rawName
      : (segments.length ? `Section ${segments.length + 1}` : 'Departure Link');

    const loc = step.maneuver?.location || [0, 0];
    const cong = Math.min(92, Math.max(12, Math.round(Math.max(0, 50 - speed) * 2.0 + 18)));

    segments.push({
      checkpointId: `CP-${segments.length + 1}`,
      name: `${road} (${cumDist.toFixed(1)} km)`,
      roadName: road,
      lat: loc[1],
      lon: loc[0],
      distanceKm: Number(cumDist.toFixed(2)),
      speed,
      congestion: cong
    });
  }

  // If steps were very short or few, sample points along geometry for a rich Segment Tree graph
  if (segments.length < 5 && route.geometry?.coordinates?.length >= 5) {
    const coords = route.geometry.coordinates;
    const totalDist = (route.distance || 1000) / 1000;
    const totalDuration = (route.duration || 60);
    const avgSpeed = totalDuration > 0 ? Math.round((route.distance / totalDuration) * 3.6) : 35;
    const count = Math.min(14, coords.length);
    const stepIdx = Math.max(1, Math.floor(coords.length / count));
    const sampled = [];

    for (let i = 0; i < coords.length; i += stepIdx) {
      const t = i / coords.length;
      const sampledDist = Number((totalDist * t).toFixed(2));
      const variation = Math.round(Math.sin(t * Math.PI * 2.5) * 8);
      const segSpeed = Math.max(14, Math.min(80, avgSpeed + variation));
      const segCong = Math.min(90, Math.max(15, Math.round((1 - segSpeed / 65) * 75)));

      sampled.push({
        checkpointId: `CP-${sampled.length + 1}`,
        name: `Road Waypoint ${sampled.length + 1} (${sampledDist} km)`,
        roadName: route.legs?.[0]?.summary || 'Route Waypoint',
        lat: coords[i][1],
        lon: coords[i][0],
        distanceKm: sampledDist,
        speed: segSpeed,
        congestion: segCong
      });
    }
    return sampled;
  }

  return segments;
}

export async function getCandidateRoutes(origin, destination) {
  const osrmRoutes = await osrmRoute(origin, destination);

  if (osrmRoutes.length > 0) {
    return osrmRoutes.map((r, index) => {
      const name = extractRouteName(r, index);
      const distKm = Number((r.distance / 1000).toFixed(2));
      const minutes = Number((r.duration / 60).toFixed(1));
      const coords = r.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      const segments = extractRouteSegments(r);

      const avgSpeed = segments.length
        ? Math.round(segments.reduce((a, b) => a + b.speed, 0) / segments.length)
        : Math.round((distKm / (minutes / 60)));

      const avgCong = segments.length
        ? Math.round(segments.reduce((a, b) => a + b.congestion, 0) / segments.length)
        : 30;

      return {
        id: `route-${index + 1}`,
        name,
        distanceKm: distKm,
        estimatedMinutes: minutes,
        congestion: avgCong,
        averageSpeed: avgSpeed,
        geometry: coords,
        segments
      };
    });
  }

  // Fallback if routing server is completely offline
  const dLat = destination.lat - origin.lat;
  const dLon = destination.lon - origin.lon;
  const distKm = Math.max(1.5, Math.sqrt((dLat * 111) ** 2 + (dLon * 85) ** 2));
  const baseMin = Number(((distKm / 40) * 60).toFixed(1));

  return [
    {
      id: 'route-1',
      name: 'Via Main Arterial Road',
      distanceKm: Number(distKm.toFixed(2)),
      estimatedMinutes: baseMin,
      congestion: 28,
      averageSpeed: 42,
      geometry: [
        [origin.lat, origin.lon],
        [origin.lat + dLat * 0.5, origin.lon + dLon * 0.5],
        [destination.lat, destination.lon]
      ],
      segments: [
        { checkpointId: 'CP-1', name: 'Starting Avenue', roadName: 'Starting Avenue', lat: origin.lat, lon: origin.lon, distanceKm: 0.5, speed: 45, congestion: 20 },
        { checkpointId: 'CP-2', name: 'Central Flyway', roadName: 'Central Flyway', lat: origin.lat + dLat * 0.5, lon: origin.lon + dLon * 0.5, distanceKm: Number((distKm * 0.6).toFixed(1)), speed: 40, congestion: 30 },
        { checkpointId: 'CP-3', name: 'Destination Approach', roadName: 'Destination Approach', lat: destination.lat, lon: destination.lon, distanceKm: Number(distKm.toFixed(1)), speed: 38, congestion: 35 }
      ]
    }
  ];
}
