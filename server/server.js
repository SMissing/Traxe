const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const PORT = 8787;

// Middleware
app.use(express.json());

// Presets directory
const PRESETS_DIR = path.join(__dirname, '../presets');

// Ensure presets directory exists
(async () => {
    try {
        await fs.mkdir(PRESETS_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating presets directory:', error);
    }
})();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve homepage from root path
app.use('/', express.static(path.join(__dirname, '../homepage')));

// Serve user pages from /user path
app.use('/user', express.static(path.join(__dirname, '../user')));

// Serve admin pages from /admin path
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Serve projector classic mode from /projector/classic path
app.use('/projector/classic', express.static(path.join(__dirname, '../projector/classic')));

// Serve projector frontend from /projector path (for future game modes)
app.use('/projector', express.static(path.join(__dirname, '../projector')));

// API endpoint to save preset
app.post('/api/presets', async (req, res) => {
    try {
        const { laneId, presetName, transform } = req.body;
        
        if (!laneId || !presetName || !transform) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const presetFile = path.join(PRESETS_DIR, `${laneId}_${presetName}.json`);
        const presetData = {
            laneId,
            presetName,
            transform,
            createdAt: new Date().toISOString()
        };
        
        await fs.writeFile(presetFile, JSON.stringify(presetData, null, 2));
        res.json({ success: true, message: 'Preset saved' });
    } catch (error) {
        console.error('Error saving preset:', error);
        res.status(500).json({ error: 'Failed to save preset' });
    }
});

// API endpoint to load preset
app.get('/api/presets/:laneId/:presetName', async (req, res) => {
    try {
        const { laneId, presetName } = req.params;
        const presetFile = path.join(PRESETS_DIR, `${laneId}_${presetName}.json`);
        
        try {
            const data = await fs.readFile(presetFile, 'utf8');
            const preset = JSON.parse(data);
            res.json(preset);
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.status(404).json({ error: 'Preset not found' });
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error loading preset:', error);
        res.status(500).json({ error: 'Failed to load preset' });
    }
});

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

    // Notify all clients of tracker status change
    const statusUpdate = JSON.stringify({
      type: 'status',
      trackers: trackerConnections.size,
      clients: clientConnections.size
    });
    clientConnections.forEach(clientWs => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(statusUpdate);
      }
    });

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

      // Notify all clients of tracker status change
      const statusUpdate = JSON.stringify({
        type: 'status',
        trackers: trackerConnections.size,
        clients: clientConnections.size
      });
      clientConnections.forEach(clientWs => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(statusUpdate);
        }
      });
    });

  } else if (url === '/ws') {
    // Client connection (projector/tablet/user)
    clientConnections.add(ws);
    console.log(`[${new Date().toISOString()}] Client connected (${clientConnections.size} clients)`);

    // Send initial connection confirmation with tracker status
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to TRAXE server'
    }));

    // Send initial tracker status
    ws.send(JSON.stringify({
      type: 'status',
      trackers: trackerConnections.size,
      clients: clientConnections.size
    }));

    // Handle incoming messages from clients (e.g., projector mode changes, transform updates)
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'setProjectorMode') {
          // Broadcast mode change to all projector clients
          const modeChangeMessage = JSON.stringify({
            type: 'setProjectorMode',
            mode: message.mode
          });
          
          clientConnections.forEach(clientWs => {
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(modeChangeMessage);
            }
          });
          
          console.log(`[${new Date().toISOString()}] Projector mode change requested: ${message.mode}`);
        } else if (message.type === 'updateTargetTransform') {
          // Broadcast transform update to all projector clients for the specified lane
          const transformMessage = JSON.stringify({
            type: 'updateTargetTransform',
            laneId: message.laneId,
            transform: message.transform
          });
          
          let sentCount = 0;
          clientConnections.forEach(clientWs => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(transformMessage);
              sentCount++;
            }
          });
          
          console.log(`[${new Date().toISOString()}] Target transform updated for ${message.laneId}, sent to ${sentCount} clients`);
        } else if (message.type === 'getCurrentTargetTransform') {
          // Forward transform request to all clients (projectors will respond)
          const requestMessage = JSON.stringify({
            type: 'getCurrentTargetTransform',
            laneId: message.laneId
          });
          
          clientConnections.forEach(clientWs => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(requestMessage);
            }
          });
          
          console.log(`[${new Date().toISOString()}] Transform request forwarded for lane ${message.laneId}`);
        } else if (message.type === 'currentTargetTransform') {
          // Forward transform response from projector to all clients (admin will receive it)
          const responseMessage = JSON.stringify({
            type: 'currentTargetTransform',
            laneId: message.laneId,
            transform: message.transform
          });
          
          clientConnections.forEach(clientWs => {
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(responseMessage);
            }
          });
          
          console.log(`[${new Date().toISOString()}] Transform response forwarded for lane ${message.laneId}`);
        }
      } catch (error) {
        console.error('Error processing client message:', error);
      }
    });

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
  console.log(`User interface: http://localhost:${PORT}/user`);
  console.log(`Admin calibration: http://localhost:${PORT}/admin/utils`);
  console.log(`Projector classic mode: http://localhost:${PORT}/projector/classic`);
  console.log(`Projector frontend: http://localhost:${PORT}/projector`);
});
