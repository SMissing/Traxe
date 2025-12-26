const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Server } = require('socket.io');
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
// Configure to ignore Socket.IO paths (Socket.IO handles its own upgrades)
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    // Only handle /tracker and /ws paths, let Socket.IO handle /socket.io/*
    const path = info.req.url;
    return path === '/tracker' || path === '/ws';
  }
});

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
    // Unknown endpoint (shouldn't reach here due to verifyClient, but handle gracefully)
    if (!url.startsWith('/socket.io/')) {
      console.log(`[${new Date().toISOString()}] Unknown connection attempt to ${url}`);
    }
    ws.close();
  }

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// ============================================================================
// Socket.IO Server for Pairing System
// ============================================================================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// In-memory state storage
const DEFAULT_VENUE_ID = "venue_default";
const DEFAULT_LANE_ID = "lane_1";

// Lane state: { laneId: { laneId, venueId, pairingCode, closed, pairedDevices: { user, projector }, inSession, gameMode, updatedAt } }
const laneStates = new Map();

// Device lock-ins: { deviceId: { laneId, venueId, code, lockedUntil } }
// deviceId is a combination of clientType + browser fingerprint (handled client-side)
const deviceLockIns = new Map();

// Initialize default lane state
laneStates.set(DEFAULT_LANE_ID, {
  laneId: DEFAULT_LANE_ID,
  venueId: DEFAULT_VENUE_ID,
  pairingCode: null,
  closed: false,
  pairedDevices: { user: false, projector: false },
  inSession: false,
  gameMode: null,
  updatedAt: Date.now()
});

// Generate a random 4-character pairing code (letters + digits)
function generatePairingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0, O, I, 1
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get room name for a lane
function getLaneRoom(venueId, laneId) {
  return `venue:${venueId}:lane:${laneId}`;
}

// Get room name for admins watching a venue
function getAdminsRoom(venueId) {
  return `venue:${venueId}:admins`;
}

// Broadcast lane state to lane room and admins room
function broadcastLaneState(venueId, laneId) {
  const state = laneStates.get(laneId);
  if (!state) return;

  const laneRoom = getLaneRoom(venueId, laneId);
  const adminsRoom = getAdminsRoom(venueId);

  io.to(laneRoom).emit('lane:state:update', state);
  io.to(adminsRoom).emit('lane:state:update', state);
}

// Clean up expired device lock-ins periodically
setInterval(() => {
  const now = Date.now();
  for (const [deviceId, lockIn] of deviceLockIns.entries()) {
    if (now > lockIn.lockedUntil) {
      deviceLockIns.delete(deviceId);
      console.log(`[${new Date().toISOString()}] Device lock-in expired for ${deviceId}`);
    }
  }
}, 60000); // Check every minute

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Socket.IO client connected: ${socket.id}`);

  // Admin: Watch venue
  socket.on('admin:venue:watch', ({ venueId }) => {
    if (!venueId) {
      socket.emit('error', { message: 'venueId required' });
      return;
    }

    const adminsRoom = getAdminsRoom(venueId);
    socket.join(adminsRoom);
    console.log(`[${new Date().toISOString()}] Admin ${socket.id} watching venue ${venueId}`);

    // Send current lane list and states
    const lanes = Array.from(laneStates.values()).filter(lane => lane.venueId === venueId);
    socket.emit('admin:venue:lanes', { venueId, lanes });
  });

  // Admin: Create pairing code (or regenerate if exists)
  socket.on('admin:pairCode:create', ({ venueId, laneId }) => {
    if (!venueId || !laneId) {
      socket.emit('error', { message: 'venueId and laneId required' });
      return;
    }

    // Get or create lane state
    let state = laneStates.get(laneId);
    if (!state) {
      state = {
        laneId,
        venueId,
        pairingCode: null,
        closed: false,
        pairedDevices: { user: false, projector: false },
        inSession: false,
        gameMode: null,
        updatedAt: Date.now()
      };
      laneStates.set(laneId, state);
    }

    // Generate new code (regenerate if already exists)
    let code;
    do {
      code = generatePairingCode();
    } while (code === state.pairingCode && state.pairingCode !== null); // Ensure it's different

    state.pairingCode = code;
    state.closed = false;
    state.updatedAt = Date.now();

    console.log(`[${new Date().toISOString()}] Pairing code ${code} created for ${venueId}/${laneId}`);

    socket.emit('admin:pairCode:created', {
      code,
      laneId,
      venueId
    });

    // Broadcast updated lane state
    broadcastLaneState(venueId, laneId);
  });

  // Admin: Close lane (invalidates code and clears lock-ins)
  socket.on('admin:lane:close', ({ venueId, laneId }) => {
    if (!venueId || !laneId) {
      socket.emit('error', { message: 'venueId and laneId required' });
      return;
    }

    const state = laneStates.get(laneId);
    if (!state) {
      socket.emit('error', { message: 'Lane not found' });
      return;
    }

    // Close the lane
    state.closed = true;
    state.pairingCode = null;
    state.pairedDevices = { user: false, projector: false };
    state.inSession = false;
    state.gameMode = null;
    state.updatedAt = Date.now();

    // Clear all device lock-ins for this lane
    for (const [deviceId, lockIn] of deviceLockIns.entries()) {
      if (lockIn.laneId === laneId) {
        deviceLockIns.delete(deviceId);
      }
    }

    console.log(`[${new Date().toISOString()}] Lane ${laneId} closed`);

    // Broadcast updated state
    broadcastLaneState(venueId, laneId);
    
    // Notify all clients in the lane room
    const laneRoom = getLaneRoom(venueId, laneId);
    io.to(laneRoom).emit('lane:closed');
  });

  // Admin: Start lane session
  socket.on('admin:lane:start', ({ venueId, laneId, gameMode }) => {
    if (!venueId || !laneId) {
      socket.emit('error', { message: 'venueId and laneId required' });
      return;
    }

    const state = laneStates.get(laneId);
    if (!state) {
      socket.emit('error', { message: 'Lane not found' });
      return;
    }

    // Update state
    state.inSession = true;
    state.gameMode = gameMode || 'Classic';
    state.updatedAt = Date.now();

    console.log(`[${new Date().toISOString()}] Lane ${laneId} started with mode ${state.gameMode}`);

    // Broadcast updated state
    broadcastLaneState(venueId, laneId);
  });

  // Client: Join with pairing code
  socket.on('client:pairCode:join', ({ code, clientType, deviceId }) => {
    if (!code || !clientType) {
      socket.emit('error', { message: 'code and clientType required' });
      return;
    }

    if (clientType !== 'user' && clientType !== 'projector') {
      socket.emit('error', { message: 'clientType must be "user" or "projector"' });
      return;
    }

    // Find lane with this code
    let targetLane = null;
    for (const [laneId, state] of laneStates.entries()) {
      if (state.pairingCode === code.toUpperCase() && !state.closed) {
        targetLane = state;
        break;
      }
    }

    if (!targetLane) {
      socket.emit('client:pairCode:error', { message: 'Invalid or closed pairing code' });
      return;
    }

    // Check if device is already locked in (within 60 minutes)
    if (deviceId) {
      const lockIn = deviceLockIns.get(deviceId);
      if (lockIn && lockIn.laneId === targetLane.laneId && Date.now() < lockIn.lockedUntil) {
        // Device is still locked in, allow auto-rejoin
        console.log(`[${new Date().toISOString()}] ${clientType} ${socket.id} auto-rejoined lane ${targetLane.laneId} (locked in)`);
      } else {
        // New pairing - create 60-minute lock-in
        deviceLockIns.set(deviceId, {
          laneId: targetLane.laneId,
          venueId: targetLane.venueId,
          code: code.toUpperCase(),
          lockedUntil: Date.now() + (60 * 60 * 1000) // 60 minutes
        });
        console.log(`[${new Date().toISOString()}] ${clientType} ${socket.id} locked in to lane ${targetLane.laneId} for 60 minutes`);
      }
    }

    // Mark device as paired
    targetLane.pairedDevices[clientType] = true;
    targetLane.updatedAt = Date.now();

    // Join lane room
    const laneRoom = getLaneRoom(targetLane.venueId, targetLane.laneId);
    socket.join(laneRoom);
    socket.data.laneId = targetLane.laneId;
    socket.data.venueId = targetLane.venueId;
    socket.data.clientType = clientType;
    socket.data.deviceId = deviceId;

    console.log(`[${new Date().toISOString()}] ${clientType} ${socket.id} joined lane ${targetLane.laneId} with code ${code}`);

    // Send success response
    socket.emit('client:pairCode:joined', {
      ok: true,
      venueId: targetLane.venueId,
      laneId: targetLane.laneId,
      state: targetLane
    });

    // Broadcast updated state
    broadcastLaneState(targetLane.venueId, targetLane.laneId);
  });

  // Client: Auto-rejoin (check if device is locked in)
  socket.on('client:autoRejoin', ({ deviceId, clientType }) => {
    if (!deviceId || !clientType) {
      socket.emit('error', { message: 'deviceId and clientType required' });
      return;
    }

    const lockIn = deviceLockIns.get(deviceId);
    if (!lockIn || Date.now() >= lockIn.lockedUntil) {
      socket.emit('client:autoRejoin:failed', { message: 'No valid lock-in found' });
      return;
    }

    const state = laneStates.get(lockIn.laneId);
    if (!state || state.closed || state.pairingCode !== lockIn.code) {
      // Lane was closed or code changed
      deviceLockIns.delete(deviceId);
      socket.emit('client:autoRejoin:failed', { message: 'Lane closed or code changed' });
      return;
    }

    // Auto-rejoin successful
    state.pairedDevices[clientType] = true;
    state.updatedAt = Date.now();

    const laneRoom = getLaneRoom(lockIn.venueId, lockIn.laneId);
    socket.join(laneRoom);
    socket.data.laneId = lockIn.laneId;
    socket.data.venueId = lockIn.venueId;
    socket.data.clientType = clientType;
    socket.data.deviceId = deviceId;

    console.log(`[${new Date().toISOString()}] ${clientType} ${socket.id} auto-rejoined lane ${lockIn.laneId}`);

    socket.emit('client:autoRejoin:success', {
      venueId: lockIn.venueId,
      laneId: lockIn.laneId,
      state
    });

    broadcastLaneState(lockIn.venueId, lockIn.laneId);
  });

  // Get lane state
  socket.on('lane:state:get', ({ venueId, laneId }) => {
    if (!venueId || !laneId) {
      socket.emit('error', { message: 'venueId and laneId required' });
      return;
    }

    const state = laneStates.get(laneId);
    if (state && state.venueId === venueId) {
      socket.emit('lane:state', state);
    } else {
      socket.emit('error', { message: 'Lane not found' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] Socket.IO client disconnected: ${socket.id}`);

    // If this was a paired device, mark it as unpaired (but keep lock-in for auto-rejoin)
    if (socket.data.laneId && socket.data.clientType) {
      const state = laneStates.get(socket.data.laneId);
      if (state) {
        state.pairedDevices[socket.data.clientType] = false;
        state.updatedAt = Date.now();
        broadcastLaneState(socket.data.venueId, socket.data.laneId);
        console.log(`[${new Date().toISOString()}] ${socket.data.clientType} disconnected from lane ${socket.data.laneId} (lock-in preserved)`);
      }
    }
  });
});

// Periodic status logging
setInterval(() => {
  const now = new Date().toISOString();
  console.log(`[${now}] Status: ${trackerConnections.size} trackers, ${clientConnections.size} clients, ${eventsPerSecond} events/sec`);
  console.log(`[${now}] Socket.IO: ${io.sockets.sockets.size} connected, ${deviceLockIns.size} active device lock-ins`);
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
  console.log(`Socket.IO: http://localhost:${PORT} (for pairing system)`);
  console.log(`User interface: http://localhost:${PORT}/user`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`Admin calibration: http://localhost:${PORT}/admin/utils`);
  console.log(`Projector: http://localhost:${PORT}/projector`);
  console.log(`Projector classic mode: http://localhost:${PORT}/projector/classic`);
});
