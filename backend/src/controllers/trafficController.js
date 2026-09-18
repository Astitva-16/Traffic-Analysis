import { rankRoutesWithHeap, queryRouteRange } from '../services/trafficEngine.js';
import { searchPlaces, getCandidateRoutes } from '../services/placeService.js';

export async function placeSearch(req, res) {
  try {
    const results = await searchPlaces(req.query.q || '');
    res.json(results);
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
}

export async function routesByPlaces(req, res) {
  try {
    const { origin, destination } = req.body;
    if (!origin?.lat || !origin?.lon || !destination?.lat || !destination?.lon) {
      return res.status(400).json({ message: 'Please select both origin and destination from the place search results.' });
    }

    const candidates = await getCandidateRoutes(origin, destination);
    const rankedRoutes = await rankRoutesWithHeap(candidates);

    if (!rankedRoutes || !rankedRoutes.length) {
      return res.status(404).json({ message: 'No routes found between these locations.' });
    }

    res.json({
      origin,
      destination,
      routes: rankedRoutes,
      selectedRoute: rankedRoutes[0]
    });
  } catch (err) {
    console.error('routesByPlaces error:', err);
    res.status(500).json({ message: err.message || 'Failed to calculate routes.' });
  }
}

export async function rangeQueryRoute(req, res) {
  try {
    const { speeds, from, to } = req.body;
    if (!Array.isArray(speeds) || !speeds.length) {
      return res.status(400).json({ message: 'speeds array is required.' });
    }
    const result = await queryRouteRange(speeds, from, to);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function summary(req, res) {
  res.json({
    status: 'Ready',
    engine: 'C++ Heap & Segment Tree',
    mode: 'Dynamic Route Intelligence'
  });
}
