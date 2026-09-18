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
    // fallback
  }
  return [];
}

function generatePathVariation(origin, destination, curvatureX, curvatureY, numPoints = 16) {
  const coords = [];
  const dLat = destination.lat - origin.lat;
  const dLon = destination.lon - origin.lon;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const arc = Math.sin(t * Math.PI);
    const lat = origin.lat + dLat * t + curvatureY * arc;
    const lon = origin.lon + dLon * t + curvatureX * arc;
    coords.push([lat, lon]);
  }
  return coords;
}

function buildRouteSegments(routeGeometry, baseSpeedLimit, congestionLevel) {
  const numCheckpoints = Math.min(18, Math.max(10, routeGeometry.length));
  const step = Math.max(1, Math.floor(routeGeometry.length / numCheckpoints));
  const segments = [];

  let cumDist = 0;
  for (let i = 0; i < routeGeometry.length; i += step) {
    const pt = routeGeometry[i];
    const prevPt = segments.length ? routeGeometry[Math.max(0, i - step)] : pt;
    const segDist = Math.sqrt(
      ((pt[0] - prevPt[0]) * 111) ** 2 + ((pt[1] - prevPt[1]) * 85) ** 2
    );
    cumDist += segDist;

    const wave = 0.35 + 0.45 * Math.sin((i / routeGeometry.length) * Math.PI * 2.5);
    const segCongestion = Math.min(95, Math.max(10, Math.round(congestionLevel * 0.7 + wave * 40)));
    const segSpeed = Math.max(12, Math.round(baseSpeedLimit * (1.0 - (segCongestion / 100) * 0.65)));

    segments.push({
      checkpointId: `CP-${segments.length + 1}`,
      name: `Checkpoint ${segments.length + 1}`,
      lat: pt[0],
      lon: pt[1],
      distanceKm: Number(cumDist.toFixed(2)),
      speed: segSpeed,
      congestion: segCongestion
    });
  }
  return segments;
}

export async function getCandidateRoutes(origin, destination) {
  const osrmRoutes = await osrmRoute(origin, destination);

  const dLat = destination.lat - origin.lat;
  const dLon = destination.lon - origin.lon;
  const straightDistKm = Math.max(1.5, Math.sqrt((dLat * 111) ** 2 + (dLon * 85) ** 2));

  const routeConfigs = [
    {
      id: 'route-1',
      name: 'Primary Arterial Expressway',
      curveX: 0.015,
      curveY: -0.012,
      distFactor: 1.05,
      speedLimit: 65,
      baseCongestion: 32
    },
    {
      id: 'route-2',
      name: 'Outer Ring Bypass Highway',
      curveX: -0.035,
      curveY: 0.025,
      distFactor: 1.22,
      speedLimit: 75,
      baseCongestion: 22
    },
    {
      id: 'route-3',
      name: 'Central Metro Transit Corridor',
      curveX: 0.005,
      curveY: 0.005,
      distFactor: 1.02,
      speedLimit: 50,
      baseCongestion: 58
    },
    {
      id: 'route-4',
      name: 'Elevated Connector Linkway',
      curveX: 0.028,
      curveY: 0.032,
      distFactor: 1.15,
      speedLimit: 70,
      baseCongestion: 38
    },
    {
      id: 'route-5',
      name: 'Suburban Boulevard Corridor',
      curveX: -0.020,
      curveY: -0.028,
      distFactor: 1.18,
      speedLimit: 55,
      baseCongestion: 45
    }
  ];

  return routeConfigs.map((cfg, index) => {
    let geometry = [];
    let distanceKm = straightDistKm * cfg.distFactor;
    let baseMinutes = 0;

    if (osrmRoutes[index] && osrmRoutes[index].geometry?.coordinates?.length) {
      geometry = osrmRoutes[index].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      distanceKm = osrmRoutes[index].distance / 1000;
      baseMinutes = osrmRoutes[index].duration / 60;
    } else {
      geometry = generatePathVariation(origin, destination, cfg.curveX, cfg.curveY, 20);
      baseMinutes = (distanceKm / cfg.speedLimit) * 60;
    }

    const congestion = cfg.baseCongestion + Math.round((Math.random() - 0.5) * 8);
    const trafficDelayMultiplier = 1.0 + (congestion / 100) * 0.75;
    const estimatedMinutes = Number((baseMinutes * trafficDelayMultiplier).toFixed(1));

    const segments = buildRouteSegments(geometry, cfg.speedLimit, congestion);
    const speeds = segments.map(s => s.speed);
    const avgSpeed = Number((speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1));

    return {
      id: cfg.id,
      name: cfg.name,
      distanceKm: Number(distanceKm.toFixed(1)),
      baseMinutes: Number(baseMinutes.toFixed(1)),
      estimatedMinutes,
      congestion: Math.round(congestion),
      averageSpeed: avgSpeed,
      geometry,
      segments
    };
  });
}
