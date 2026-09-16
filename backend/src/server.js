import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import http from 'http';
import routes from './routes/trafficRoutes.js';
import { seedSegments, startSimulator, processEvent } from './services/trafficEngine.js';
import { assertEngineAvailable } from './services/cppEngine.js';

const app = express();
const server = http.createServer(app);
const configuredOrigin = process.env.CLIENT_URL || 'http://localhost:5174';
const allowOrigin = origin => {
  if (!origin) return true;
  if (origin === configuredOrigin) return true;
  return /^http:\/\/localhost:517\d$/.test(origin);
};

const io = new Server(server, { cors: { origin: allowOrigin } });
app.use(cors({ origin: allowOrigin }));
app.use(express.json());
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'traffic-analysis', time: new Date() }));
app.use('/api', routes);
app.locals.processEvent = e => processEvent(e, io);
io.on('connection', socket => socket.emit('connected', { message: 'Real-time traffic stream connected' }));

const port = Number(process.env.PORT || 5000);
const start = async () => {
  const engineReady = await assertEngineAvailable();
  if (!engineReady) {
    console.error('C++ engine not found. Build cpp-engine first with build.bat (Windows) or build.sh (Linux/macOS).');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/traffic_analysis');
    await seedSegments();
    server.listen(port, () => console.log(`Backend running on ${port}`));
    startSimulator(io);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};
start();
