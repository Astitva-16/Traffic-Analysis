import 'dotenv/config';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function enginePath() {
  const configured = process.env.CPP_ENGINE_PATH;
  if (configured && fsSync.existsSync(configured)) return configured;

  const exe = process.platform === 'win32' ? 'traffic_engine.exe' : 'traffic_engine';
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'cpp-engine', exe),
    path.resolve(__dirname, '..', '..', 'cpp-engine', exe),
    path.resolve(process.cwd(), 'cpp-engine', exe),
    path.resolve(process.cwd(), '..', 'cpp-engine', exe),
    path.resolve(process.cwd(), exe)
  ];

  for (const c of candidates) {
    if (fsSync.existsSync(c)) return c;
  }
  return candidates[0];
}

async function run(command, content) {
  const bin = enginePath();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'traffic-cpp-'));
  const input = path.join(dir, 'input.txt');
  await fs.writeFile(input, content, 'utf8');
  try {
    const { stdout } = await execFileAsync(bin, [command, input], { timeout: 10000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim());
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function cppRange(values, from, to) {
  try {
    const content = `${values.length} ${from} ${to}\n${values.join(' ')}\n`;
    return await run('range', content);
  } catch (err) {
    // JS Fallback
    const subset = values.slice(Math.max(0, from), Math.min(values.length, to + 1));
    if (!subset.length) return { ok: true, count: 0, average: 0, min: 0, max: 0 };
    const sum = subset.reduce((a, b) => a + b, 0);
    return {
      ok: true,
      count: subset.length,
      average: Number((sum / subset.length).toFixed(2)),
      min: Number(Math.min(...subset).toFixed(2)),
      max: Number(Math.max(...subset).toFixed(2))
    };
  }
}

export async function cppBottlenecks(rows) {
  try {
    const lines = [String(rows.length)];
    for (const r of rows) {
      lines.push([r.segmentId, String(r.name).replaceAll('|', '/'), r.score, r.speed, r.occupancy, r.volume].join('|'));
    }
    return await run('bottlenecks', lines.join('\n') + '\n');
  } catch (err) {
    // JS Fallback
    return rows
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
      .map(r => ({
        segmentId: r.segmentId,
        name: r.name,
        score: Number((r.score || 0).toFixed(1)),
        speed: Number((r.speed || 0).toFixed(1)),
        occupancy: Number((r.occupancy || 0).toFixed(1)),
        volume: Number(r.volume || 0)
      }));
  }
}

export async function cppCandidateRoute(baseMinutes, trafficAverage) {
  try {
    const content = `${baseMinutes.length} ${trafficAverage}\n${baseMinutes.join(' ')}\n`;
    return await run('candidate-route', content);
  } catch (err) {
    // JS Fallback
    const factor = 1.0 + Math.min(0.35, Math.max(0, trafficAverage) / 300.0);
    const weighted = baseMinutes.map((b, i) => b * factor * (1.0 + i * 0.025));
    let minIdx = 0;
    for (let i = 1; i < weighted.length; i++) {
      if (weighted[i] < weighted[minIdx]) minIdx = i;
    }
    return {
      ok: true,
      minutes: Number(weighted[minIdx].toFixed(2)),
      selectedIndex: minIdx,
      trafficFactor: Number(factor.toFixed(2))
    };
  }
}

export async function cppSimulate(segments) {
  try {
    const lines = [String(segments.length)];
    for (const s of segments) {
      lines.push([s.segmentId, s.name.replaceAll('|', '/'), s.speedLimit, s.capacity, Number(s.segmentId.replace(/\D/g, '') || 1)].join('|'));
    }
    return await run('simulate', lines.join('\n') + '\n');
  } catch (err) {
    // JS Fallback
    const t = Date.now() / 1000;
    return segments.map(s => {
      const seed = Number(s.segmentId.replace(/\D/g, '') || 1);
      const pressure = 0.35 + 0.45 * Math.abs(Math.sin(t / 45.0 + seed));
      const noise = (Math.random() - 0.5) * 10;
      const speed = Math.max(8.0, Math.min(s.speedLimit, s.speedLimit * (1.0 - pressure * 0.72) + noise));
      const volume = Math.round(s.capacity * (0.35 + pressure * 0.8));
      const occupancy = Math.min(100, Math.round((volume / s.capacity) * 100 + Math.random() * 8));
      const congestion = Math.round(Math.max(0, Math.min(100, (1.0 - speed / s.speedLimit) * 70.0 + (occupancy / 100.0) * 30.0)));
      return {
        segmentId: s.segmentId,
        name: s.name,
        speed: Number(speed.toFixed(1)),
        volume,
        occupancy,
        congestion
      };
    });
  }
}

export async function assertEngineAvailable() {
  try {
    const p = enginePath();
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
