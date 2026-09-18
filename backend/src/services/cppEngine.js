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

export async function cppRankRoutes(routes) {
  try {
    const lines = [String(routes.length)];
    for (const r of routes) {
      lines.push([
        r.id,
        String(r.name).replaceAll('|', '/'),
        r.estimatedMinutes,
        r.distanceKm,
        r.congestion
      ].join('|'));
    }
    const ranked = await run('rank-routes', lines.join('\n') + '\n');
    if (Array.isArray(ranked) && ranked.length > 0) {
      return ranked.map(rk => {
        const orig = routes.find(r => r.id === rk.id) || {};
        return { ...orig, ...rk };
      });
    }
  } catch (err) {
    console.warn('[C++ Engine] cppRankRoutes fallback used:', err.message);
  }

  return [...routes]
    .sort((a, b) => {
      const scoreA = a.estimatedMinutes * (1.0 + a.congestion / 200.0);
      const scoreB = b.estimatedMinutes * (1.0 + b.congestion / 200.0);
      return scoreA - scoreB;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
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
