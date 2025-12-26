// TRAXE Admin Dashboard
class AdminDashboard {
    constructor() {
        this.socket = null;
        this.venueId = 'venue_default';
        this.lanes = new Map();
        
        this.init();
    }
    
    init() {
        this.connectSocket();
        this.setupNavigation();
        this.setupLanes();
    }
    
    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Admin connected to server');
            this.updateConnectionStatus(true);
            
            // Watch the default venue
            this.socket.emit('admin:venue:watch', { venueId: this.venueId });
        });
        
        this.socket.on('disconnect', () => {
            console.log('Admin disconnected from server');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('admin:venue:lanes', ({ venueId, lanes }) => {
            console.log('Received lanes:', lanes);
            lanes.forEach(lane => {
                this.lanes.set(lane.laneId, lane);
            });
            this.renderLanes();
        });
        
        this.socket.on('lane:state:update', (state) => {
            console.log('Lane state updated:', state);
            this.lanes.set(state.laneId, state);
            this.renderLanes();
        });
        
        this.socket.on('admin:pairCode:created', ({ code, laneId }) => {
            console.log(`Pairing code created: ${code} for ${laneId}`);
            // Code is now persistent, just re-render
            this.renderLanes();
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            alert(`Error: ${error.message || 'Unknown error'}`);
        });
    }
    
    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) {
            const status = document.createElement('div');
            status.id = 'connection-status';
            status.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
            status.textContent = connected ? 'Connected' : 'Disconnected';
            document.body.appendChild(status);
        } else {
            statusEl.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
            statusEl.textContent = connected ? 'Connected' : 'Disconnected';
        }
    }
    
    setupNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                
                // Update active button
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Show/hide pages
                document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
                document.getElementById(`page-${page}`).classList.remove('hidden');
            });
        });
    }
    
    setupLanes() {
        // Initial render
        this.renderLanes();
    }
    
    renderLanes() {
        const container = document.getElementById('lanes-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.lanes.size === 0) {
            container.innerHTML = '<p style="color: var(--text2);">No lanes found. Creating default lane...</p>';
            // The server should have created lane_1, but if not, we'll wait for state updates
            return;
        }
        
        this.lanes.forEach((lane, laneId) => {
            const card = this.createLaneCard(lane);
            container.appendChild(card);
        });
    }
    
    createLaneCard(lane) {
        const card = document.createElement('div');
        card.className = 'lane-card';
        card.dataset.laneId = lane.laneId;
        
        // Determine status
        const isPaired = lane.pairedDevices.user && lane.pairedDevices.projector;
        const isPartial = (lane.pairedDevices.user || lane.pairedDevices.projector) && !isPaired;
        const status = isPaired ? 'paired' : (isPartial ? 'partial' : 'offline');
        const statusText = isPaired ? 'Paired' : (isPartial ? 'Partially Paired' : 'Offline');
        
        // Show pairing code if it exists and lane is not closed
        const hasCode = lane.pairingCode && !lane.closed;
        
        card.innerHTML = `
            <div class="lane-header">
                <div class="lane-title">${lane.laneId}</div>
                <div class="lane-status ${status}">${statusText}</div>
            </div>
            
            <div class="lane-info">
                <div class="info-item">
                    <div class="info-label">User Device</div>
                    <div class="info-value">
                        <span class="device-status ${lane.pairedDevices.user ? 'paired' : 'unpaired'}">
                            ${lane.pairedDevices.user ? 'Paired' : 'Not Paired'}
                        </span>
                    </div>
                </div>
                
                <div class="info-item">
                    <div class="info-label">Projector</div>
                    <div class="info-value">
                        <span class="device-status ${lane.pairedDevices.projector ? 'paired' : 'unpaired'}">
                            ${lane.pairedDevices.projector ? 'Paired' : 'Not Paired'}
                        </span>
                    </div>
                </div>
                
                <div class="info-item">
                    <div class="info-label">In Session</div>
                    <div class="info-value">${lane.inSession ? 'Yes' : 'No'}</div>
                </div>
                
                <div class="info-item">
                    <div class="info-label">Game Mode</div>
                    <div class="info-value">${lane.gameMode || 'None'}</div>
                </div>
            </div>
            
            ${hasCode ? this.createPairCodeDisplay(lane.pairingCode) : ''}
            ${lane.closed ? '<div class="lane-closed-notice">Lane Closed</div>' : ''}
            
            <div class="lane-actions">
                ${!hasCode ? `
                    <button class="btn btn-secondary" onclick="adminDashboard.generatePairCode('${lane.laneId}')">
                        Generate Pair Code
                    </button>
                ` : `
                    <button class="btn btn-secondary" onclick="adminDashboard.closeLane('${lane.laneId}')">
                        Close Lane
                    </button>
                `}
                <button 
                    class="btn btn-primary" 
                    onclick="adminDashboard.startLane('${lane.laneId}')"
                    ${!isPaired || lane.inSession ? 'disabled' : ''}
                >
                    Start Classic
                </button>
            </div>
        `;
        
        return card;
    }
    
    createPairCodeDisplay(code) {
        return `
            <div class="pair-code-display">
                <div style="font-size: 0.875rem; color: var(--text2); margin-bottom: 0.5rem;">Lane Pairing Code</div>
                <div class="pair-code">${code}</div>
                <div class="pair-code-expiry" style="color: var(--text2); font-size: 0.875rem; margin-top: 0.5rem;">
                    Valid for 60 minutes after pairing
                </div>
            </div>
        `;
    }
    
    generatePairCode(laneId) {
        if (!this.socket || !this.socket.connected) {
            alert('Not connected to server');
            return;
        }
        
        this.socket.emit('admin:pairCode:create', {
            venueId: this.venueId,
            laneId
        });
    }
    
    closeLane(laneId) {
        if (!this.socket || !this.socket.connected) {
            alert('Not connected to server');
            return;
        }
        
        if (!confirm(`Are you sure you want to close ${laneId}? This will invalidate the pairing code and disconnect all devices.`)) {
            return;
        }
        
        this.socket.emit('admin:lane:close', {
            venueId: this.venueId,
            laneId
        });
    }
    
    startLane(laneId) {
        if (!this.socket || !this.socket.connected) {
            alert('Not connected to server');
            return;
        }
        
        this.socket.emit('admin:lane:start', {
            venueId: this.venueId,
            laneId,
            gameMode: 'Classic'
        });
    }
}

// Initialize dashboard
const adminDashboard = new AdminDashboard();

