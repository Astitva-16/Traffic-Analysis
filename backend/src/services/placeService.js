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
    // proceed to fallback
  }

  // Fallback search over preset Delhi landmarks if offline or Nominatim fails/rate-limits
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
  const url = `${OSRM}/route/v1/driving/${coords}?alternatives=3&overview=full&geometries=geojson&steps=false`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const data = await response.json();
      if (data.code === 'Ok' && data.routes?.length) {
        return data.routes;
      }
    }
  } catch {
    // proceed to fallback
  }

  // Fallback route generator if OSRM is unreachable
  const dLat = destination.lat - origin.lat;
  const dLon = destination.lon - origin.lon;
  const distKm = Math.max(1.0, Math.sqrt((dLat * 111) ** 2 + (dLon * 85) ** 2));
  const baseDurationSec = (distKm / 35) * 3600;

  return [
    {
      distance: distKm * 1000,
      duration: baseDurationSec,
      geometry: {
        coordinates: [
          [origin.lon, origin.lat],
          [origin.lon + dLon * 0.5 + 0.005, origin.lat + dLat * 0.5 - 0.005],
          [destination.lon, destination.lat]
        ]
      }
    },
    {
      distance: distKm * 1180,
      duration: baseDurationSec * 1.15,
      geometry: {
        coordinates: [
          [origin.lon, origin.lat],
          [origin.lon + dLon * 0.3 - 0.008, origin.lat + dLat * 0.7 + 0.008],
          [destination.lon, destination.lat]
        ]
      }
    }
  ];
}

export async function getCandidateRoutes(origin, destination) {
  const routes = await osrmRoute(origin, destination);
  return routes.slice(0, 3).map((r, index) => ({
    id: `route-${index + 1}`,
    baseMinutes: r.duration / 60,
    distanceKm: r.distance / 1000,
    geometry: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    rank: index + 1
  }));
}
