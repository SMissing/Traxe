const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../projector')));

// Serve projector frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../projector/index.html'));
});

// WebSocket connections
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle tracker data
  socket.on('tracker-data', (data) => {
    // Broadcast tracking data to all connected projector clients
    socket.broadcast.emit('tracking-update', data);
  });

  // Handle calibration data
  socket.on('calibration-data', (data) => {
    socket.broadcast.emit('calibration-update', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TRAXE server running on port ${PORT}`);
  console.log(`Projector interface available at http://localhost:${PORT}`);
});
