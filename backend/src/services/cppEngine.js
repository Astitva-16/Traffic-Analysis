import 'dotenv/config';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function enginePath() {
  const configured = process.env.CPP_ENGINE_PATH;
  if (configured) return configured;
  const exe = process.platform === 'win32' ? 'traffic_engine.exe' : 'traffic_engine';
  return path.resolve(process.cwd(), '..', 'cpp-engine', exe);
}

async function run(command, content) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'traffic-cpp-'));
  const input = path.join(dir, 'input.txt');
  await fs.writeFile(input, content, 'utf8');
  try {
    const { stdout } = await execFileAsync(enginePath(), [command, input], { timeout: 10000, maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim());
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function cppRange(values, from, to) {
  const content = `${values.length} ${from} ${to}\n${values.join(' ')}\n`;
  return run('range', content);
}

export async function cppBottlenecks(rows) {
  const lines = [String(rows.length)];
  for (const r of rows) lines.push([r.segmentId, String(r.name).replaceAll('|', '/'), r.score, r.speed, r.occupancy, r.volume].join('|'));
  return run('bottlenecks', lines.join('\n') + '\n');
}

export async function cppCandidateRoute(baseMinutes, trafficAverage) {
  return run('candidate-route', `${baseMinutes.length} ${trafficAverage}\n${baseMinutes.join(' ')}\n`);
}

export async function cppSimulate(segments) {
  const lines = [String(segments.length)];
  for (const s of segments) lines.push([s.segmentId, s.name.replaceAll('|', '/'), s.speedLimit, s.capacity, Number(s.segmentId.replace(/\D/g, '') || 1)].join('|'));
  return run('simulate', lines.join('\n') + '\n');
}

export async function assertEngineAvailable() {
  try {
    await fs.access(enginePath());
    return true;
  } catch {
    return false;
  }
}
