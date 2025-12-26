# TRAXE Pairing System Documentation

## Overview

The pairing system enables Jackbox-style device pairing where multiple browser views (user tablet, projector display) can connect to a central server and join the same lane using a short pairing code.

## How to Run

### 1. Install Dependencies

```bash
cd server
npm install
```

This will install:
- `express` - Web server
- `ws` - WebSocket server (existing)
- `socket.io` - Socket.IO for pairing system (new)

### 2. Start the Server

```bash
cd server
npm run dev
```

Or:

```bash
npm start
```

The server will start on port **8787** by default.

### 3. Open the Interfaces

Open the following URLs in separate browser windows/tabs:

- **Admin Dashboard**: `http://localhost:8787/admin`
  - Use this to generate pairing codes and manage lanes
  - Open on your management/control computer

- **User Interface**: `http://localhost:8787/user`
  - This is the tablet/controller screen
  - Open on the lane's tablet device

- **Projector Display**: `http://localhost:8787/projector`
  - This is the second display/projector output
  - Open on the lane's projector/second screen

### 4. Pairing Flow

1. **Admin generates a pairing code**:
   - Go to the "Lanes" section in the admin dashboard
   - Click "Generate Pair Code" for lane_1
   - A 4-character code will appear (e.g., "7KQ2")
   - The code expires in 120 seconds

2. **User device joins**:
   - On the user interface, enter the pairing code
   - Click "Connect"
   - Once paired, the game mode selector will appear

3. **Projector joins**:
   - On the projector display, enter the same pairing code
   - Click "Connect"
   - Once paired, the TRAXE logo and lane info will display

4. **Admin starts the session**:
   - Once both devices are paired, the "Start Classic" button becomes enabled
   - Click "Start Classic" to begin the game session
   - All devices will receive live state updates

## Socket.IO Events

### Admin Events

#### `admin:venue:watch`
**Emit**: Admin wants to watch a venue
```javascript
socket.emit('admin:venue:watch', { venueId: 'venue_default' });
```
**Response**: `admin:venue:lanes`
```javascript
{
  venueId: 'venue_default',
  lanes: [
    {
      laneId: 'lane_1',
      venueId: 'venue_default',
      pairedDevices: { user: false, projector: false },
      inSession: false,
      gameMode: null,
      updatedAt: 1234567890
    }
  ]
}
```

#### `admin:pairCode:create`
**Emit**: Admin creates a new pairing code
```javascript
socket.emit('admin:pairCode:create', { 
  venueId: 'venue_default', 
  laneId: 'lane_1' 
});
```
**Response**: `admin:pairCode:created`
```javascript
{
  code: '7KQ2',
  expiresAt: 1234567890,
  laneId: 'lane_1',
  venueId: 'venue_default'
}
```

#### `admin:lane:start`
**Emit**: Admin starts a lane session
```javascript
socket.emit('admin:lane:start', { 
  venueId: 'venue_default', 
  laneId: 'lane_1', 
  gameMode: 'Classic' 
});
```

### Client Events (User & Projector)

#### `client:pairCode:join`
**Emit**: Client joins with a pairing code
```javascript
socket.emit('client:pairCode:join', { 
  code: '7KQ2', 
  clientType: 'user' // or 'projector'
});
```
**Response**: `client:pairCode:joined` (success)
```javascript
{
  ok: true,
  venueId: 'venue_default',
  laneId: 'lane_1',
  state: {
    laneId: 'lane_1',
    venueId: 'venue_default',
    pairedDevices: { user: true, projector: false },
    inSession: false,
    gameMode: null,
    updatedAt: 1234567890
  }
}
```
**Response**: `client:pairCode:error` (failure)
```javascript
{
  message: 'Invalid pairing code' // or 'Pairing code expired', etc.
}
```

#### `lane:state:get`
**Emit**: Get current lane state
```javascript
socket.emit('lane:state:get', { 
  venueId: 'venue_default', 
  laneId: 'lane_1' 
});
```
**Response**: `lane:state`
```javascript
{
  laneId: 'lane_1',
  venueId: 'venue_default',
  pairedDevices: { user: true, projector: true },
  inSession: true,
  gameMode: 'Classic',
  updatedAt: 1234567890
}
```

### Broadcast Events

#### `lane:state:update`
**Receive**: Lane state has been updated (broadcast to all clients in lane room and admins)
```javascript
{
  laneId: 'lane_1',
  venueId: 'venue_default',
  pairedDevices: { user: true, projector: true },
  inSession: true,
  gameMode: 'Classic',
  updatedAt: 1234567890
}
```

## Room Structure

- **Lane Room**: `venue:${venueId}:lane:${laneId}`
  - Contains all paired devices (user + projector) for a specific lane
  - Receives lane state updates

- **Admins Room**: `venue:${venueId}:admins`
  - Contains all admin clients watching a venue
  - Receives lane state updates for all lanes in the venue

## State Management

Lane state is stored in-memory on the server with the following structure:

```javascript
{
  laneId: string,           // e.g., "lane_1"
  venueId: string,          // e.g., "venue_default"
  pairedDevices: {
    user: boolean,          // Is user device paired?
    projector: boolean      // Is projector paired?
  },
  inSession: boolean,       // Is a game session active?
  gameMode: string | null,  // Current game mode (e.g., "Classic")
  updatedAt: number         // Timestamp of last update
}
```

## Pairing Code Rules

- **Format**: 4 characters (letters + digits)
- **Excluded characters**: 0, O, I, 1 (to avoid confusion)
- **Expiration**: 120 seconds after generation
- **Single-use**: Once used, the code is invalidated
- **Cleanup**: Expired codes are automatically removed every 5 seconds

## Default Configuration

- **Default Venue ID**: `venue_default`
- **Default Lane ID**: `lane_1`
- **Server Port**: `8787`

## Reconnection Handling

If a client disconnects:
- The device is marked as unpaired in the lane state
- The client must re-enter the pairing code to rejoin
- Future enhancement: Automatic rejoin using saved pairing state

## Notes

- All state is stored in-memory (no database yet)
- Server restart will clear all pairing codes and lane states
- Multiple admins can watch the same venue simultaneously
- Each lane can have one user device and one projector device paired

