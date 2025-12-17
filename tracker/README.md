# TRAXE Tracker

The core tracking component that handles RealSense camera input, depth processing, calibration, and hit detection.

## Requirements

- **Python 3.11 or 3.12** (⚠️ pyrealsense2 does not support Python 3.14)
- RealSense camera (D435 or similar)
- Projector display

## Setup

### Option 1: Install Python 3.12 (Recommended)

1. **Download Python 3.12:**
   - Visit: https://www.python.org/downloads/release/python-3120/
   - Download the Windows installer (64-bit)
   - During installation, check "Add Python to PATH"

2. **Create a virtual environment:**
   ```bash
   py -3.12 -m venv venv
   ```

3. **Activate the virtual environment:**
   ```bash
   .\venv\Scripts\Activate.ps1
   ```

4. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

### Option 2: Use Existing Python 3.12

If you already have Python 3.12 installed:

```bash
# Check available Python versions
py --list

# Create venv with Python 3.12
py -3.12 -m venv venv

# Activate and install
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Running

```bash
python tracker.py
```

## Controls

- **SPACE**: Confirm calibration point when axe is positioned
- **R**: Reset calibration
- **B**: Recapture background
- **ESC**: Exit program

## Configuration

Edit the constants at the top of `tracker.py`:

- `PROJECTOR_MONITOR_INDEX`: Which monitor is the projector (0-based)
- `STABLE_SECONDS`: How long object must be stable to trigger (0.5s)
- `MIN_DEPTH_M/MAX_DEPTH_M`: Depth detection range
- `TARGET_SIZE_RATIO`: Size of target as fraction of screen (0.75 = 75%)

## Troubleshooting

- **If `pyrealsense2` still fails to install:** Make sure you're using Python 3.11 or 3.12, not 3.14
- **If RealSense camera not detected:** Ensure the camera is connected and drivers are installed
- **If import errors persist:** Verify you're in the activated virtual environment
- **If script doesn't start:** Make sure the virtual environment is activated first
- **If monitor index error:** Change `PROJECTOR_MONITOR_INDEX = 1` to `PROJECTOR_MONITOR_INDEX = 0` in tracker.py

## Integration

The tracker communicates with the server via WebSocket to send:
- Real-time tracking data (hits/misses)
- Calibration status updates
