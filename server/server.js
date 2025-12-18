const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const PORT = 8787;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve projector frontend from /projector path
app.use('/projector', express.static(path.join(__dirname, '../projector')));

// WebSocket server
const wss = new WebSocket.Server({ server });

// Track connections by type
const trackerConnections = new Set();
const clientConnections = new Set();

// Connection counters for logging
let totalConnections = 0;
let eventsPerSecond = 0;
let eventCount = 0;
let lastEventTime = Date.now();

wss.on('connection', (ws, req) => {
  const url = req.url;
  totalConnections++;

  if (url === '/tracker') {
    // Tracker connection
    trackerConnections.add(ws);
    console.log(`[${new Date().toISOString()}] Tracker connected (${trackerConnections.size} trackers)`);

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());

        // Validate event structure
        if (!event.type || !event.laneId || typeof event.x !== 'number' || typeof event.y !== 'number') {
          console.error('Invalid event structure:', event);
          return;
        }

        // Update events per second counter
        eventCount++;
        const now = Date.now();
        if (now - lastEventTime >= 1000) {
          eventsPerSecond = eventCount;
          eventCount = 0;
          lastEventTime = now;
        }

        console.log(`[${new Date().toISOString()}] ${event.type} from ${event.laneId}: (${event.x.toFixed(3)}, ${event.y.toFixed(3)})`);

        // Transform to official hit event for clients
        const hitEvent = {
          type: 'hit',
          laneId: event.laneId,
          x: event.x,
          y: event.y,
          t: event.t || now,
          miss: event.type === 'rawMiss' || event.meta?.miss || false
        };

        // Broadcast to all client connections
        clientConnections.forEach(clientWs => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(hitEvent));
          }
        });

      } catch (error) {
        console.error('Error processing tracker message:', error);
      }
    });

    ws.on('close', () => {
      trackerConnections.delete(ws);
      console.log(`[${new Date().toISOString()}] Tracker disconnected (${trackerConnections.size} trackers)`);
    });

  } else if (url === '/ws') {
    // Client connection (projector/tablet)
    clientConnections.add(ws);
    console.log(`[${new Date().toISOString()}] Client connected (${clientConnections.size} clients)`);

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to TRAXE server'
    }));

    ws.on('close', () => {
      clientConnections.delete(ws);
      console.log(`[${new Date().toISOString()}] Client disconnected (${clientConnections.size} clients)`);
    });

  } else {
    // Unknown endpoint
    console.log(`[${new Date().toISOString()}] Unknown connection attempt to ${url}`);
    ws.close();
  }

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Periodic status logging
setInterval(() => {
  const now = new Date().toISOString();
  console.log(`[${now}] Status: ${trackerConnections.size} trackers, ${clientConnections.size} clients, ${eventsPerSecond} events/sec`);
}, 10000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down TRAXE server...');
  wss.clients.forEach(client => client.close());
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TRAXE server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Tracker WebSocket: ws://localhost:${PORT}/tracker`);
  console.log(`Client WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`Projector frontend: http://localhost:${PORT}/projector`);
});
