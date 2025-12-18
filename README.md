# TRAXE - Throwing Axe Tracking System

A real-time throwing axe tracking system using Intel RealSense depth camera and projector display.

## Architecture

This project is organized into three main components:

```
traxe/
├── tracker/          # Python tracking backend
├── server/           # Node.js WebSocket server
├── projector/        # Web-based projector frontend
└── README.md
```

## Components

### Tracker (`tracker/`)
- RealSense camera depth processing
- Object detection and tracking
- Homography calibration (camera ↔ projector space)
- Hit/miss detection on target
- Dual output modes: standalone visual or WebSocket events

### Server (`server/`)
- WebSocket server on port 8787
- `/tracker` endpoint for tracker connections
- `/ws` endpoint for client connections (projector/tablet)
- Serves projector frontend at `/projector`
- Real-time hit event broadcasting

### Projector (`projector/`)
- Fullscreen target display with 8x8 grid
- WebSocket client connecting to `/ws`
- Real-time hit marker rendering
- Miss flash effects
- Keyboard shortcuts: F (fullscreen), ESC (exit fullscreen)

## Quick Start

1. **Start Server:**
   ```bash
   cd server
   npm install
   npm start
   ```
   Server runs on http://localhost:8787

2. **Open Projector:**
   - Navigate to `http://localhost:8787/projector` in a browser
   - Click anywhere or press F for fullscreen
   - Connection status shown in top-left corner

3. **Setup & Run Tracker:**
   ```bash
   cd ../tracker
   python -m venv venv
   # Windows: .\venv\Scripts\activate
   # Linux/Mac: source venv/bin/activate
   pip install -r requirements.txt

   # Option A: Visual mode (standalone OpenCV window)
   python tracker.py

   # Option B: WebSocket mode (sends events to server)
   # Edit tracker/config.py: OUTPUT_MODE = "ws"
   python tracker.py
   ```

## Requirements

- **Hardware:**
  - Intel RealSense D435/D455 camera
  - Projector display
  - Computer with USB 3.0

- **Software:**
  - Python 3.11 or 3.12 (for pyrealsense2 compatibility)
  - Node.js 16+
  - RealSense SDK

## Usage

### Calibration (in tracker)
1. Position axe at each calibration point (shown on screen)
2. Press SPACE when axe is stable at each point
3. Complete all 5 points (corners + center)

### Throwing
- Throw axe at the target
- In visual mode: markers appear directly in OpenCV window
- In WebSocket mode: events sent to server → broadcast to projector clients
- Hits: white circle with burst effect
- Misses: brief border flash

### WebSocket Event Schema

Tracker sends to server:
```json
{
  "type": "rawHit",
  "laneId": "lane1",
  "x": 0.5,
  "y": 0.3,
  "t": 1640995200000,
  "meta": { "source": "realsense", "confidence": 1.0 }
}
```

Server broadcasts to clients:
```json
{
  "type": "hit",
  "laneId": "lane1",
  "x": 0.5,
  "y": 0.3,
  "t": 1640995200000,
  "miss": false
}
```

## Configuration

### Tracker (`tracker/config.py`)
- `LANE_ID`: Identifier for this tracker instance
- `WS_URL`: WebSocket server URL
- `OUTPUT_MODE`: "visual" or "ws"

### Server
- Port: 8787 (configurable in server.js)
- Health check: `GET /health`

## Troubleshooting

- **Camera not detected:** Ensure RealSense drivers are installed
- **Wrong monitor:** Adjust `PROJECTOR_MONITOR_INDEX` in tracker.py
- **WebSocket connection fails:** Check server is running on port 8787
- **Python version issues:** Must use Python 3.11 or 3.12 for pyrealsense2
- **Projector not fullscreen:** Press F key or double-click

## License

MIT
