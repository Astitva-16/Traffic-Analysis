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
const configuredOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
const allowOrigin = (origin, callback) => {
  if (!origin) return callback ? callback(null, true) : true;
  if (origin === configuredOrigin || /^http:\/\/(localhost|127\.0\.0\.1):(517\d|3000|5000)$/.test(origin)) {
    return callback ? callback(null, true) : true;
  }
  return callback ? callback(null, true) : true;
};

const io = new Server(server, { cors: { origin: allowOrigin } });
app.use(cors({ origin: allowOrigin }));
app.use(express.json());
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'traffic-analysis', time: new Date() }));
app.use('/api', routes);
app.locals.processEvent = e => processEvent(e, io);
io.on('connection', socket => {
  socket.emit('connected', { message: 'Real-time traffic stream connected' });
});

const port = Number(process.env.PORT || 5000);
const start = async () => {
  const engineReady = await assertEngineAvailable();
  if (engineReady) {
    console.log('[Traffic Engine] C++ engine binary detected and ready.');
  } else {
    console.warn('[Traffic Engine] C++ engine binary not found or not compiled. Using embedded JS fallback.');
  }

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/traffic_analysis';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    console.log('[Database] MongoDB connected successfully.');
    await seedSegments();
    server.listen(port, () => {
      console.log(`[Server] Backend listening on http://localhost:${port}`);
    });
    startSimulator(io);
  } catch (err) {
    console.error('[Database] MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

start();
