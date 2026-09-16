import TrafficReading from '../models/TrafficReading.js';
import RoadSegment from '../models/RoadSegment.js';
import { cppBottlenecks, cppRange, cppCandidateRoute, cppSimulate } from './cppEngine.js';

export const segments = [
  ['S1','Ring Road A','28.6139,77.2090','28.6200,77.2150',1.4,60,1800,28.6139,77.2090,28.6200,77.2150],
  ['S2','Ring Road B','28.6200,77.2150','28.6255,77.2250',1.1,50,1500,28.6200,77.2150,28.6255,77.2250],
  ['S3','Market Link','28.6255,77.2250','28.6180,77.2320',0.8,40,1200,28.6255,77.2250,28.6180,77.2320],
  ['S4','Airport Link','28.6200,77.2150','28.6060,77.2300',2.0,70,2200,28.6200,77.2150,28.6060,77.2300],
  ['S5','Central Avenue','28.6060,77.2300','28.5960,77.2180',1.3,50,1600,28.6060,77.2300,28.5960,77.2180],
  ['S6','Civic Road','28.6180,77.2320','28.5960,77.2180',1.0,45,1300,28.6180,77.2320,28.5960,77.2180],
  ['S7','Bypass','28.6139,77.2090','28.6060,77.2300',2.6,80,2500,28.6139,77.2090,28.6060,77.2300],
  ['S8','North Connector','28.6139,77.2090','28.6255,77.2250',2.0,55,1400,28.6139,77.2090,28.6255,77.2250]
].map(x => ({
  segmentId: x[0], name: x[1], from: x[2], to: x[3], lengthKm: x[4], speedLimit: x[5], capacity: x[6],
  geometry: [[x[7], x[8]], [x[9], x[10]]]
}));

export async function seedSegments() {
  for (const s of segments) {
    const existing = await RoadSegment.findOne({ segmentId: s.segmentId });
    if (!existing) await RoadSegment.create({ ...s, currentSpeed: s.speedLimit, volume: 0, occupancy: 0, congestion: 0, updatedAt: new Date() });
  }
}

export async function processEvent(event, io) {
  const s = segments.find(x => x.segmentId === event.segmentId);
  if (!s) return;
  const segment = await RoadSegment.findOneAndUpdate(
    { segmentId: event.segmentId },
    { $set: { currentSpeed: event.speed, volume: event.volume, occupancy: event.occupancy, congestion: event.congestion ?? 0, updatedAt: event.timestamp } },
    { new: true }
  );
  await TrafficReading.create(event);
  if (io) io.emit('traffic:update', { segmentId: event.segmentId, ...event, congestion: event.congestion ?? 0 });
}

export async function startSimulator(io) {
  if (process.env.SIMULATOR_ENABLED === 'false') return;
  const tick = async () => {
    try {
      const generated = await cppSimulate(segments);
      await Promise.all(generated.map(event => processEvent({ ...event, timestamp: new Date() }, io)));
    } catch (err) {
      console.error('C++ traffic simulator error:', err.message);
    }
  };
  await tick();
  setInterval(tick, 2000);
}

export async function getBottlenecks() {
  const all = await RoadSegment.find().lean();
  return cppBottlenecks(all.map(s => ({
    segmentId: s.segmentId,
    name: s.name,
    score: s.congestion ?? 0,
    speed: s.currentSpeed,
    occupancy: s.occupancy,
    volume: s.volume
  })));
}

export async function rangeStats(id, from, to) {
  const rows = await TrafficReading.find({ segmentId: id }).sort({ timestamp: 1 }).limit(500).lean();
  if (!rows.length) return { count: 0, average: 0, min: 0, max: 0 };
  return cppRange(rows.map(x => x.speed), from, to);
}

export async function routeCandidates(candidates, trafficAverage) {
  if (!candidates.length) return null;
  const result = await cppCandidateRoute(candidates.map(c => c.baseMinutes), trafficAverage);
  if (!result.ok) return null;
  const chosen = candidates[result.selectedIndex] || candidates[0];
  return { ...chosen, estimatedMinutes: Number(result.minutes.toFixed(2)), selectedIndex: result.selectedIndex, liveFactor: result.trafficFactor };
}
