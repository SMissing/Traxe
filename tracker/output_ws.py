"""
TRAXE WebSocket Output Module

Handles sending hit/miss events to the WebSocket server.
"""

import json
import time
import websocket
import threading
from config import LANE_ID, WS_URL


class TraxeWSOutput:
    def __init__(self):
        self.ws = None
        self.connected = False
        self._connect()

    def _connect(self):
        """Establish WebSocket connection to server"""
        try:
            self.ws = websocket.WebSocketApp(
                WS_URL,
                on_open=self._on_open,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close
            )

            # Start WebSocket in a separate thread
            wst = threading.Thread(target=self.ws.run_forever)
            wst.daemon = True
            wst.start()

            # Wait a bit for connection to establish
            time.sleep(1)

        except Exception as e:
            print(f"Failed to connect to WebSocket server: {e}")
            self.connected = False

    def _on_open(self, ws):
        """WebSocket connection opened"""
        print(f"Connected to TRAXE server at {WS_URL}")
        self.connected = True

    def _on_message(self, ws, message):
        """Handle incoming WebSocket messages"""
        # Server might send acknowledgments or other messages
        pass

    def _on_error(self, ws, error):
        """Handle WebSocket errors"""
        print(f"WebSocket error: {error}")
        self.connected = False

    def _on_close(self, ws, close_status_code, close_msg):
        """WebSocket connection closed"""
        print("WebSocket connection closed")
        self.connected = False

    def send_hit(self, x, y, timestamp=None, miss=False):
        """
        Send a hit/miss event to the server.

        Args:
            x, y: Normalized coordinates (0.0-1.0) within target square
            timestamp: Unix timestamp in milliseconds (optional, uses current time if not provided)
            miss: Boolean indicating if this is a miss
        """
        if not self.connected or self.ws is None:
            return

        if timestamp is None:
            timestamp = int(time.time() * 1000)

        event = {
            "type": "rawHit" if not miss else "rawMiss",
            "laneId": LANE_ID,
            "x": float(x),
            "y": float(y),
            "t": timestamp,
            "meta": {
                "source": "realsense",
                "confidence": 1.0
            }
        }

        # For misses, add the miss flag to meta
        if miss:
            event["meta"]["miss"] = True

        try:
            self.ws.send(json.dumps(event))
        except Exception as e:
            print(f"Failed to send WebSocket event: {e}")
            self.connected = False

    def close(self):
        """Close the WebSocket connection"""
        if self.ws:
            self.ws.close()


# Global instance
ws_output = None


def init_ws_output():
    """Initialize WebSocket output"""
    global ws_output
    if ws_output is None:
        ws_output = TraxeWSOutput()
    return ws_output


def send_hit_event(x, y, timestamp=None, miss=False):
    """Convenience function to send hit events"""
    global ws_output
    if ws_output is None:
        ws_output = init_ws_output()
    ws_output.send_hit(x, y, timestamp, miss)
