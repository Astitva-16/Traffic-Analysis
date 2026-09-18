import { cppRange, cppRankRoutes } from './cppEngine.js';

export async function rankRoutesWithHeap(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  return cppRankRoutes(candidates);
}

export async function queryRouteRange(speeds, from, to) {
  if (!Array.isArray(speeds) || !speeds.length) {
    return { ok: true, count: 0, average: 0, min: 0, max: 0 };
  }
  const ql = Math.max(0, Number(from ?? 0));
  const qr = Math.min(speeds.length - 1, Number(to ?? speeds.length - 1));
  return cppRange(speeds, ql, qr);
}
