const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const cache = new Map();
let lastNominatimAt = 0;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function nominatimSearch(query) {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const wait = Math.max(0, 1000 - (Date.now() - lastNominatimAt));
  if (wait) await sleep(wait);
  lastNominatimAt = Date.now();

  const url = new URL(NOMINATIM);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TrafficAnalysisStudentProject/1.0 (local development)' }
  });
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);
  const data = await response.json();
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

export async function searchPlaces(query) {
  if (!query || query.trim().length < 2) return [];
  return nominatimSearch(query.trim());
}

async function osrmRoute(origin, destination) {
  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const url = `${OSRM}/route/v1/driving/${coords}?alternatives=3&overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Routing service failed (${response.status})`);
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No drivable route found between these places.');
  return data.routes;
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
