import TrafficReading from '../models/TrafficReading.js';
import RoadSegment from '../models/RoadSegment.js';
import { getBottlenecks, routeCandidates, rangeStats } from '../services/trafficEngine.js';
import { searchPlaces, getCandidateRoutes } from '../services/placeService.js';

export async function listSegments(req, res) {
  const data = await RoadSegment.find().lean();
  res.json(data.map(s => ({ ...s, congestion: s.congestion ?? 0 })));
}

export async function history(req, res) {
  const { id } = req.params;
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 3600000);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const rows = await TrafficReading.find({ segmentId: id, timestamp: { $gte: from, $lte: to } }).sort({ timestamp: 1 }).lean();
  res.json(rows);
}

export async function queryRange(req, res) {
  const { id } = req.params;
  const rows = await TrafficReading.find({ segmentId: id }).sort({ timestamp: 1 }).limit(500).lean();
  if (!rows.length) return res.json({ count: 0, average: 0, min: 0, max: 0 });
  const from = Number(req.query.from ?? 0);
  const to = Number(req.query.to ?? rows.length - 1);
  const result = await rangeStats(id, Math.max(0, from), Math.min(rows.length - 1, to));
  res.json(result);
}

export async function summary(req, res) {
  const s = await RoadSegment.find().lean();
  const total = s.reduce((a, x) => a + x.lengthKm, 0);
  const avg = s.length ? s.reduce((a, x) => a + (x.currentSpeed || 0), 0) / s.length : 0;
  const congestion = s.length ? s.reduce((a, x) => a + (x.congestion ?? 0), 0) / s.length : 0;
  res.json({ segments: s.length, totalRoadKm: +total.toFixed(2), averageSpeed: +avg.toFixed(1), averageCongestion: +congestion.toFixed(1), activeSensors: s.length });
}

export async function bottlenecks(req, res) {
  res.json(await getBottlenecks());
}

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
    const current = await RoadSegment.find().lean();
    const avgCongestion = current.length ? current.reduce((sum, s) => sum + congestionScore(s), 0) / current.length : 0;
    const chosen = await routeCandidates(candidates, avgCongestion);
    if (!chosen) return res.status(404).json({ message: 'No route found.' });
    res.json({
      origin,
      destination,
      ...chosen,
      candidates: candidates.map((c, i) => ({ id: c.id, distanceKm: +c.distanceKm.toFixed(2), baseMinutes: +(c.baseMinutes).toFixed(2), rank: i + 1 }))
    });
  } catch (err) {
    res.status(502).json({ message: err.message });
  }
}

export async function ingest(req, res) {
  const { segmentId, speed, volume, occupancy, timestamp } = req.body;
  if (!segmentId || speed == null) return res.status(400).json({ message: 'segmentId and speed are required' });
  const event = { segmentId, speed: Number(speed), volume: Number(volume || 0), occupancy: Number(occupancy || 0), timestamp: timestamp ? new Date(timestamp) : new Date() };
  req.app.locals.processEvent(event);
  res.status(202).json({ accepted: true, event });
}
