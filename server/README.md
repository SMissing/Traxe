# TRAXE Server

The server component handles real-time communication between the tracker and projector components.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

## API

### WebSocket Events

#### From Tracker to Server
- `tracker-data`: Real-time tracking data (hits, misses, centroids)
- `calibration-data`: Calibration points and homography matrix

#### From Server to Projector
- `tracking-update`: Broadcasts tracking data to projector clients
- `calibration-update`: Broadcasts calibration data to projector clients

## Ports

- Server runs on port 3000 by default
- Projector frontend is served at `http://localhost:3000`






