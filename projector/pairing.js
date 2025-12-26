// TRAXE Projector Pairing System
class ProjectorPairing {
    constructor() {
        this.socket = null;
        this.paired = false;
        this.laneState = null;
        this.venueId = null;
        this.laneId = null;
        this.broadcastChannel = null;
        this.deviceId = this.getDeviceId();
        
        this.init();
    }
    
    getDeviceId() {
        // Generate a persistent device ID based on browser fingerprint
        let deviceId = localStorage.getItem('traxe_projector_device_id');
        if (!deviceId) {
            // Generate a unique ID based on browser characteristics
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('TraxeProjectorFingerprint', 2, 2);
            
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
            
            deviceId = 'projector_' + Math.abs(hash).toString(36);
            localStorage.setItem('traxe_projector_device_id', deviceId);
        }
        return deviceId;
    }
    
    init() {
        this.connectSocket();
        this.setupBroadcastChannel();
        this.startTimer();
        
        // Hide pairing screen by default (projector doesn't need to enter code)
        const pairingScreen = document.getElementById('pairing-screen');
        if (pairingScreen) {
            pairingScreen.classList.add('hidden');
        }
        
        // Show waiting screen
        this.showWaitingScreen();
        
        // Try auto-rejoin if we have a saved lock-in
        this.tryAutoRejoin();
    }
    
    startTimer() {
        // Update timer every second - countdown from lock-in expiration
        const updateTimer = () => {
            const timerEl = document.getElementById('timer');
            if (!timerEl) return;
            
            // Get lock-in expiration time
            const savedLockIn = localStorage.getItem('traxe_projector_lock_in');
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
                    localStorage.removeItem('traxe_projector_lock_in');
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
        const savedLockIn = localStorage.getItem('traxe_projector_lock_in');
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
                localStorage.removeItem('traxe_projector_lock_in');
            }
        } catch (e) {
            console.error('Error parsing saved lock-in:', e);
            localStorage.removeItem('traxe_projector_lock_in');
        }
    }
    
    attemptAutoRejoin(lockIn) {
        console.log('Projector attempting auto-rejoin...');
        this.socket.emit('client:autoRejoin', {
            deviceId: this.deviceId,
            clientType: 'projector'
        });
    }
    
    setupBroadcastChannel() {
        // Use BroadcastChannel to communicate with user page on same device
        this.broadcastChannel = new BroadcastChannel('traxe_pairing');
        
        // Listen for pairing requests from user page
        this.broadcastChannel.onmessage = (event) => {
            const { type, code } = event.data;
            
            if (type === 'pair_request') {
                console.log('Received pair request from user page with code:', code);
                // Automatically pair with the code provided by user page
                this.pairWithCode(code);
            } else if (type === 'check_projector') {
                // User page is checking if projector is available, announce ourselves
                this.broadcastChannel.postMessage({ type: 'projector_ready' });
            } else if (type === 'pair_error') {
                // User page had an error, show waiting again
                this.showWaitingScreen();
            }
        };
        
        // Announce that projector is available
        this.broadcastChannel.postMessage({ type: 'projector_ready' });
        
        // Periodically announce availability (in case user page missed the first message)
        setInterval(() => {
            if (!this.paired) {
                this.broadcastChannel.postMessage({ type: 'projector_ready' });
            }
        }, 2000);
    }
    
    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Projector connected to server');
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            console.log('Projector disconnected from server');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('client:pairCode:joined', ({ ok, venueId, laneId, state }) => {
            if (ok) {
                console.log('Projector successfully paired:', { venueId, laneId });
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
                localStorage.setItem('traxe_projector_lock_in', JSON.stringify(lockIn));
                
                // Notify user page of success
                if (this.broadcastChannel) {
                    this.broadcastChannel.postMessage({
                        type: 'projector_paired',
                        venueId,
                        laneId,
                        state
                    });
                }
                
                this.showPairedUI();
            }
        });
        
        this.socket.on('client:autoRejoin:success', ({ venueId, laneId, state }) => {
            console.log('Projector auto-rejoin successful:', { venueId, laneId });
            this.paired = true;
            this.venueId = venueId;
            this.laneId = laneId;
            this.laneState = state;
            this.showPairedUI();
        });
        
        this.socket.on('client:autoRejoin:failed', ({ message }) => {
            console.log('Projector auto-rejoin failed:', message);
            localStorage.removeItem('traxe_projector_lock_in');
            // Show waiting screen
            this.showWaitingScreen();
        });
        
        this.socket.on('lane:closed', () => {
            console.log('Lane was closed by admin');
            this.paired = false;
            localStorage.removeItem('traxe_projector_lock_in');
            this.showWaitingScreen();
        });
        
        this.socket.on('client:pairCode:error', ({ message }) => {
            console.error('Projector pairing error:', message);
            // Notify user page of error
            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: 'projector_pair_error',
                    message
                });
            }
            this.showWaitingScreen();
        });
        
        this.socket.on('lane:state:update', (state) => {
            console.log('Lane state updated:', state);
            this.laneState = state;
            this.updateLaneInfo();
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showWaitingScreen();
        });
    }
    
    updateConnectionStatus(connected) {
        // Connection status is shown in the waiting/paired UI
    }
    
    pairWithCode(code) {
        if (!this.socket || !this.socket.connected) {
            console.error('Projector not connected to server');
            return;
        }
        
        console.log('Projector pairing with code:', code);
        
        this.socket.emit('client:pairCode:join', {
            code,
            clientType: 'projector',
            deviceId: this.deviceId
        });
    }
    
    showWaitingScreen() {
        // Hide loading overlay
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
        
        // Show waiting message in main app
        const app = document.getElementById('app');
        if (app) {
            app.classList.remove('hidden');
            const projectorContent = app.querySelector('.projector-content');
            if (projectorContent) {
                const waitingEl = projectorContent.querySelector('.waiting-message');
                if (!waitingEl) {
                    const waiting = document.createElement('div');
                    waiting.className = 'waiting-message';
                    waiting.innerHTML = `
                        <img id="traxe-logo" src="assets/Traxe_Logo.png" alt="TRAXE" />
                        <h1>TRAXE</h1>
                        <p>Waiting for pairing...</p>
                        <div class="connection-status connected">Connected</div>
                    `;
                    projectorContent.innerHTML = '';
                    projectorContent.appendChild(waiting);
                }
            }
        }
    }
    
    showPairedUI() {
        // Hide loading overlay
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
        
        // Show main app with paired content
        const app = document.getElementById('app');
        if (app) {
            app.classList.remove('hidden');
            
            const projectorContent = app.querySelector('.projector-content');
            if (projectorContent) {
                projectorContent.innerHTML = `
                    <div class="projector-main">
                        <img id="traxe-logo" src="assets/Traxe_Logo.png" alt="TRAXE" />
                    </div>
                   
                `;
            }
        }
        
        this.updateLaneInfo();
    }
    
    updateLaneInfo() {
        if (!this.laneState) return;
        
        const infoEl = document.getElementById('lane-info');
        if (infoEl) {
            const mode = this.laneState.gameMode || 'Not Started';
            const inSession = this.laneState.inSession ? 'In Session' : 'Ready';
            infoEl.textContent = `${this.laneState.laneId} • ${mode} • ${inSession}`;
        }
    }
}

// Initialize pairing
const projectorPairing = new ProjectorPairing();

