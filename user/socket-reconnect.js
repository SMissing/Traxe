// Socket.IO Reconnection Utility for Game Mode Pages
// This ensures Socket.IO stays connected and reports location when navigating to game mode pages

(function() {
    let socket = null;
    let deviceId = null;
    let venueId = null;
    let laneId = null;
    
    // Get device ID from localStorage
    function getDeviceId() {
        if (!deviceId) {
            deviceId = localStorage.getItem('traxe_device_id');
        }
        return deviceId;
    }
    
    // Get lock-in info
    function getLockIn() {
        const saved = localStorage.getItem('traxe_lock_in');
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            return null;
        }
    }
    
    // Connect to Socket.IO
    function connectSocket() {
        if (socket && socket.connected) {
            return socket;
        }
        
        socket = io();
        
        socket.on('connect', () => {
            console.log('Socket.IO reconnected on game mode page');
            
            // Try auto-rejoin if we have lock-in
            const lockIn = getLockIn();
            if (lockIn && getDeviceId()) {
                socket.emit('client:autoRejoin', {
                    deviceId: getDeviceId(),
                    clientType: 'user'
                });
            }
        });
        
        socket.on('client:autoRejoin:success', ({ venueId: vId, laneId: lId, state }) => {
            venueId = vId;
            laneId = lId;
            reportLocation(); // Report location after rejoin
        });
        
        socket.on('disconnect', () => {
            console.log('Socket.IO disconnected on game mode page');
        });
        
        return socket;
    }
    
    // Report current location to server
    function reportLocation() {
        if (!socket || !socket.connected) {
            return;
        }
        
        const path = window.location.pathname;
        let location = 'pairing';
        
        if (path === '/user') {
            location = 'choosing';
        } else if (path.startsWith('/user/')) {
            const mode = path.split('/')[2];
            if (mode) {
                location = mode.charAt(0).toUpperCase() + mode.slice(1).replace(/-/g, ' ');
            }
        }
        
        socket.emit('client:location:update', { location });
    }
    
    // Initialize on page load
    function init() {
        const lockIn = getLockIn();
        if (lockIn) {
            venueId = lockIn.venueId;
            laneId = lockIn.laneId;
            
            // Connect and report location
            connectSocket();
            
            // Report location once connected
            if (socket) {
                socket.once('connect', () => {
                    setTimeout(reportLocation, 100);
                });
            }
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Expose for manual calls if needed
    window.traxeSocketReconnect = {
        connect: connectSocket,
        reportLocation: reportLocation
    };
})();

