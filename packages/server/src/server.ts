import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import routes from './api/routes';
import { setSocketIO as setTagManagerIO } from './opcua/tagManager';
import { setSocketIO as setIntervalManagerIO } from './api/intervalManager';
import { scriptExecutor } from './script/executor';

function loadConfig(): { port: number } {
  const configPath = path.resolve(__dirname, '../config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw);
    return { port: Number(cfg.port) || 3000 };
  } catch {
    return { port: 3000 };
  }
}

const app = express();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());
app.use('/api', routes);

// In production, serve the compiled React client
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Wire up Socket.IO to services that need it
setTagManagerIO(io);
setIntervalManagerIO(io);
scriptExecutor.setSocketIO(io);

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

const config = loadConfig();
const PORT = Number(process.env.PORT ?? config.port);
httpServer.listen(PORT, () => {
  console.log(`\n  OPC UA Simulator server running on http://localhost:${PORT}\n`);
});
