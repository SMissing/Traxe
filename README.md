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

### Server (`server/`)
- WebSocket communication hub
- Serves projector frontend
- Real-time data broadcasting

### Projector (`projector/`)
- Fullscreen target display
- Real-time marker rendering
- Calibration status display

## Quick Start

1. **Setup Tracker:**
   ```bash
   cd tracker
   python -m venv venv
   # Windows: .\venv\Scripts\activate
   # Linux/Mac: source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Setup Server:**
   ```bash
   cd ../server
   npm install
   npm start
   ```

3. **Open Projector:**
   - Navigate to `http://localhost:3000` in a browser on your projector display
   - Enter fullscreen mode

4. **Run Tracker:**
   ```bash
   cd ../tracker
   python tracker.py
   ```

## Requirements

- **Hardware:**
  - Intel RealSense D435/D455 camera
  - Projector display
  - Computer with USB 3.0

- **Software:**
  - Python 3.11 or 3.12
  - Node.js 16+
  - RealSense SDK

## Usage

1. **Calibration:**
   - Position axe at each of the 5 calibration points
   - Press SPACE to confirm each point
   - System computes camera-to-projector mapping

2. **Throwing:**
   - Throw axe at the target
   - System detects hits/misses in real-time
   - Markers appear on projector display

## Configuration

See individual component READMEs for detailed configuration options.

## Troubleshooting

- **Camera not detected:** Ensure RealSense drivers are installed
- **Wrong monitor:** Adjust `PROJECTOR_MONITOR_INDEX` in tracker.py
- **Python version issues:** Must use Python 3.11 or 3.12 for pyrealsense2 compatibility

## License

MIT
