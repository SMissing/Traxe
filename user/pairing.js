// TRAXE User Pairing System
class UserPairing {
    constructor() {
        this.socket = null;
        this.paired = false;
        this.laneState = null;
        this.venueId = null;
        this.laneId = null;
        this.broadcastChannel = null;
        this.projectorAvailable = false;
        this.deviceId = this.getDeviceId();
        
        this.init();
    }
    
    getDeviceId() {
        // Generate a persistent device ID based on browser fingerprint
        let deviceId = localStorage.getItem('traxe_device_id');
        if (!deviceId) {
            // Generate a unique ID based on browser characteristics
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('TraxeDeviceFingerprint', 2, 2);
            
            const fingerprint = [
                navigator.userAgent,
                navigator.language,
                screen.width + 'x' + screen.height,
                new Date().getTimezoneOffset(),
                canvas.toDataURL()
            ].join('|');
            
            // Simple hash
            let hash = 0;
            for (let i = 0; i < fingerprint.length; i++) {
                const char = fingerprint.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            
            deviceId = 'user_' + Math.abs(hash).toString(36);
            localStorage.setItem('traxe_device_id', deviceId);
        }
        return deviceId;
    }
    
    init() {
        this.connectSocket();
        this.setupPairingUI();
        this.setupBroadcastChannel();
        this.startTimer();
        
        // Initialize projector status display
        this.updateProjectorStatus();
        
        // Try auto-rejoin if we have a saved lock-in
        this.tryAutoRejoin();
    }
    
    startTimer() {
        // Update timer every second - countdown from lock-in expiration
        const updateTimer = () => {
            const timerEl = document.getElementById('timer');
            if (!timerEl) return;
            
            // Get lock-in expiration time
            const savedLockIn = localStorage.getItem('traxe_lock_in');
            if (!savedLockIn) {
                timerEl.textContent = '00:00';
                return;
            }
            
            try {
                const lockIn = JSON.parse(savedLockIn);
                const now = Date.now();
                const timeRemaining = lockIn.lockedUntil - now;
                
                if (timeRemaining <= 0) {
                    timerEl.textContent = '00:00';
                    localStorage.removeItem('traxe_lock_in');
                    return;
                }
                
                // Calculate minutes and seconds remaining
                const minutes = Math.floor(timeRemaining / 60000);
                const seconds = Math.floor((timeRemaining % 60000) / 1000);
                
                timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            } catch (e) {
                console.error('Error parsing lock-in for timer:', e);
                timerEl.textContent = '00:00';
            }
        };
        
        // Update immediately and then every second
        updateTimer();
        setInterval(updateTimer, 1000);
    }
    
    tryAutoRejoin() {
        const savedLockIn = localStorage.getItem('traxe_lock_in');
        if (!savedLockIn) return;
        
        try {
            const lockIn = JSON.parse(savedLockIn);
            const now = Date.now();
            
            // Check if lock-in is still valid (within 60 minutes)
            if (now < lockIn.lockedUntil) {
                // Wait for socket to connect, then try auto-rejoin
                if (this.socket && this.socket.connected) {
                    this.attemptAutoRejoin(lockIn);
                } else {
                    this.socket.once('connect', () => {
                        this.attemptAutoRejoin(lockIn);
                    });
                }
            } else {
                // Lock-in expired, clear it
                localStorage.removeItem('traxe_lock_in');
            }
        } catch (e) {
            console.error('Error parsing saved lock-in:', e);
            localStorage.removeItem('traxe_lock_in');
        }
    }
    
    attemptAutoRejoin(lockIn) {
        console.log('Attempting auto-rejoin...');
        this.socket.emit('client:autoRejoin', {
            deviceId: this.deviceId,
            clientType: 'user'
        });
    }
    
    setupBroadcastChannel() {
        // Use BroadcastChannel to communicate with projector page on same device
        this.broadcastChannel = new BroadcastChannel('traxe_pairing');
        
        // Listen for projector availability
        this.broadcastChannel.onmessage = (event) => {
            const { type } = event.data;
            
            if (type === 'projector_ready') {
                console.log('Projector page detected on same device');
                this.projectorAvailable = true;
                this.updateProjectorStatus();
            } else if (type === 'projector_paired') {
                // Projector successfully paired
                const { venueId, laneId, state } = event.data;
                this.laneState = state;
                this.updateLaneInfo();
            } else if (type === 'projector_pair_error') {
                // Projector had an error pairing
                console.error('Projector pairing error:', event.data.message);
            }
        };
        
        // Check for projector periodically
        setInterval(() => {
            if (!this.projectorAvailable) {
                // Request projector to announce itself
                this.broadcastChannel.postMessage({ type: 'check_projector' });
            }
        }, 1000);
    }
    
    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('User connected to server');
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            console.log('User disconnected from server');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('client:pairCode:joined', ({ ok, venueId, laneId, state }) => {
            if (ok) {
                console.log('User successfully paired:', { venueId, laneId });
                this.paired = true;
                this.venueId = venueId;
                this.laneId = laneId;
                this.laneState = state;
                
                // Save lock-in info (60 minutes from now)
                const lockIn = {
                    venueId,
                    laneId,
                    code: state.pairingCode,
                    lockedUntil: Date.now() + (60 * 60 * 1000) // 60 minutes
                };
                localStorage.setItem('traxe_lock_in', JSON.stringify(lockIn));
                
                // Now that user is paired, send code to projector to pair itself
                const input = document.getElementById('pair-code-input');
                const code = input ? input.value.trim().toUpperCase() : '';
                
                if (this.broadcastChannel && this.projectorAvailable && code) {
                    console.log('Sending pairing code to projector:', code);
                    this.broadcastChannel.postMessage({
                        type: 'pair_request',
                        code
                    });
                }
                
                this.showPairedUI();
            }
        });
        
        this.socket.on('client:autoRejoin:success', ({ venueId, laneId, state }) => {
            console.log('Auto-rejoin successful:', { venueId, laneId });
            this.paired = true;
            this.venueId = venueId;
            this.laneId = laneId;
            this.laneState = state;
            this.showPairedUI();
        });
        
        this.socket.on('client:autoRejoin:failed', ({ message }) => {
            console.log('Auto-rejoin failed:', message);
            localStorage.removeItem('traxe_lock_in');
            // Show pairing screen
        });
        
        this.socket.on('lane:closed', () => {
            console.log('Lane was closed by admin');
            this.paired = false;
            localStorage.removeItem('traxe_lock_in');
            // Show pairing screen again
            const pairingScreen = document.getElementById('pairing-screen');
            const app = document.getElementById('app');
            if (pairingScreen) pairingScreen.classList.remove('hidden');
            if (app) app.classList.add('hidden');
            this.showPairingError('Lane was closed. Please enter a new code.');
        });
        
        this.socket.on('client:pairCode:error', ({ message }) => {
            this.showPairingError(message);
            // Notify projector page of error
            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: 'pair_error',
                    message
                });
            }
        });
        
        this.socket.on('lane:state:update', (state) => {
            console.log('Lane state updated:', state);
            this.laneState = state;
            this.updateLaneInfo();
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showPairingError(error.message || 'Connection error');
        });
    }
    
    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
            statusEl.textContent = connected ? 'Connected' : 'Disconnected';
        }
    }
    
    setupPairingUI() {
        const input = document.getElementById('pair-code-input');
        const submitBtn = document.getElementById('pair-submit-btn');
        
        // Auto-uppercase and filter input
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
        
        // Submit on Enter
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitPairCode();
            }
        });
        
        // Submit button
        submitBtn.addEventListener('click', () => {
            this.submitPairCode();
        });
    }
    
    submitPairCode() {
        const input = document.getElementById('pair-code-input');
        const code = input.value.trim().toUpperCase();
        
        if (code.length !== 4) {
            this.showPairingError('Please enter a 4-character code');
            return;
        }
        
        if (!this.socket || !this.socket.connected) {
            this.showPairingError('Not connected to server');
            return;
        }
        
        // Check if projector is available - REQUIRED before pairing
        if (!this.projectorAvailable) {
            this.showPairingError('Projector page not detected. Please open /projector in another tab.');
            return;
        }
        
        this.showPairingStatus('Connecting...');
        
        // Pair user device first (don't send code to projector yet)
        // Projector will pair after user successfully pairs
        this.socket.emit('client:pairCode:join', {
            code,
            clientType: 'user',
            deviceId: this.deviceId
        });
    }
    
    updateProjectorStatus() {
        const statusEl = document.getElementById('projector-status');
        if (statusEl) {
            if (this.projectorAvailable) {
                statusEl.textContent = 'Projector detected ✓';
                statusEl.className = 'projector-status available';
            } else {
                statusEl.textContent = 'Projector not detected';
                statusEl.className = 'projector-status unavailable';
            }
        }
    }
    
    showPairingStatus(message) {
        const statusEl = document.getElementById('pairing-status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'pairing-status';
        }
    }
    
    showPairingError(message) {
        const statusEl = document.getElementById('pairing-status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'pairing-status error';
        }
    }
    
    showPairedUI() {
        // Hide pairing screen
        const pairingScreen = document.getElementById('pairing-screen');
        if (pairingScreen) {
            pairingScreen.classList.add('hidden');
        }
        
        // Show main app
        const app = document.getElementById('app');
        if (app) {
            app.classList.remove('hidden');
        }
        
        this.updateLaneInfo();
    }
    
    updateLaneInfo() {
        // Lane info removed - not needed on user page
    }
}

// Initialize pairing
const userPairing = new UserPairing();

