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
            // The server should have created lanes, but if not, we'll wait for state updates
            return;
        }
        
        // Convert Map to Array, sort by laneId, then create cards for each lane
        const sortedLanes = Array.from(this.lanes.values()).sort((a, b) => {
            // Sort lanes by their laneId (e.g., lane_1, lane_2, etc.)
            return a.laneId.localeCompare(b.laneId, undefined, { numeric: true, sensitivity: 'base' });
        });
        
        sortedLanes.forEach(lane => {
            const card = this.createLaneCard(lane);
            container.appendChild(card);
        });
    }
    
    getGameModeColors(gameMode) {
        const modeColors = {
            'Classic': {
                primary: '#7C3AED',
                secondary: '#A78BFA',
                border: 'rgba(124, 58, 237, 0.3)',
                borderHover: 'rgba(124, 58, 237, 0.6)',
                borderActive: 'rgba(124, 58, 237, 0.8)',
                gradient: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(167, 139, 250, 0.1) 50%, rgba(79, 70, 229, 0.15) 100%)',
                glow: 'rgba(124, 58, 237, 0.4)',
                icon: this.createTargetIcon()
            },
            'Bullseye Blitz': {
                primary: '#FF8C42',
                secondary: '#FF6B35',
                border: 'rgba(255, 140, 66, 0.3)',
                borderHover: 'rgba(255, 140, 66, 0.6)',
                borderActive: 'rgba(255, 140, 66, 0.8)',
                gradient: 'linear-gradient(135deg, rgba(255, 140, 66, 0.15) 0%, rgba(255, 107, 53, 0.1) 50%, rgba(255, 165, 0, 0.15) 100%)',
                glow: 'rgba(255, 140, 66, 0.4)',
                icon: this.createBullseyeIcon()
            },
            'Xs & Os': {
                primary: '#3B82F6',
                secondary: '#60A5FA',
                border: 'rgba(59, 130, 246, 0.3)',
                borderHover: 'rgba(59, 130, 246, 0.6)',
                borderActive: 'rgba(59, 130, 246, 0.8)',
                gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.1) 50%, rgba(37, 99, 235, 0.15) 100%)',
                glow: 'rgba(59, 130, 246, 0.4)',
                icon: this.createGridIcon()
            },
            'Clay Breaker': {
                primary: '#10B981',
                secondary: '#34D399',
                border: 'rgba(16, 185, 129, 0.3)',
                borderHover: 'rgba(16, 185, 129, 0.6)',
                borderActive: 'rgba(16, 185, 129, 0.8)',
                gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.1) 50%, rgba(5, 150, 105, 0.15) 100%)',
                glow: 'rgba(16, 185, 129, 0.4)',
                icon: this.createClayIcon()
            },
            'Killer': {
                primary: '#EF4444',
                secondary: '#F87171',
                border: 'rgba(239, 68, 68, 0.3)',
                borderHover: 'rgba(239, 68, 68, 0.6)',
                borderActive: 'rgba(239, 68, 68, 0.8)',
                gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(248, 113, 113, 0.1) 50%, rgba(220, 38, 38, 0.15) 100%)',
                glow: 'rgba(239, 68, 68, 0.4)',
                icon: this.createKillerIcon()
            },
            '10 Pin': {
                primary: '#F59E0B',
                secondary: '#FBBF24',
                border: 'rgba(245, 158, 11, 0.3)',
                borderHover: 'rgba(245, 158, 11, 0.6)',
                borderActive: 'rgba(245, 158, 11, 0.8)',
                gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(251, 191, 36, 0.1) 50%, rgba(217, 119, 6, 0.15) 100%)',
                glow: 'rgba(245, 158, 11, 0.4)',
                icon: this.createPinIcon()
            }
        };
        
        return modeColors[gameMode] || {
            primary: '#6b7280',
            secondary: '#9ca3af',
            border: 'rgba(107, 114, 128, 0.3)',
            borderHover: 'rgba(107, 114, 128, 0.6)',
            borderActive: 'rgba(107, 114, 128, 0.8)',
            gradient: 'linear-gradient(135deg, rgba(107, 114, 128, 0.15) 0%, rgba(156, 163, 175, 0.1) 50%, rgba(75, 85, 99, 0.15) 100%)',
            glow: 'rgba(107, 114, 128, 0.4)',
            icon: this.createDotIcon()
        };
    }
    
    createTargetIcon() {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="6"/>
            <circle cx="12" cy="12" r="2" fill="currentColor"/>
        </svg>`;
    }
    
    createBullseyeIcon() {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="7"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="12" cy="12" r="1" fill="currentColor"/>
        </svg>`;
    }
    
    createGridIcon() {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="6" height="6"/>
            <rect x="15" y="3" width="6" height="6"/>
            <rect x="3" y="15" width="6" height="6"/>
            <rect x="15" y="15" width="6" height="6"/>
        </svg>`;
    }
    
    createClayIcon() {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="8"/>
            <path d="M8 12h8M12 8v8"/>
        </svg>`;
    }
    
    createKillerIcon() {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
        </svg>`;
    }
    
    createPinIcon() {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="3"/>
            <path d="M12 11v10M9 21h6"/>
        </svg>`;
    }
    
    createDotIcon() {
        return `<svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="4"/>
        </svg>`;
    }
    
    formatLocation(location) {
        if (!location) return '';
        // Format location for display
        if (location === 'choosing') return 'Choosing';
        if (location === 'pairing') return 'Pairing';
        if (location === 'main') return 'Main';
        // For game modes, return as-is (already formatted)
        return location;
    }
    
    createLaneCard(lane) {
        const card = document.createElement('div');
        card.className = 'lane-card';
        card.dataset.laneId = lane.laneId;
        
        // Determine status
        const isPaired = lane.pairedDevices.user && lane.pairedDevices.projector;
        const isPartial = (lane.pairedDevices.user || lane.pairedDevices.projector) && !isPaired;
        const status = isPaired ? 'paired' : (isPartial ? 'partial' : 'offline');
        
        // Determine game mode from lane.gameMode or device location
        // If gameMode is not set, use the user's location (if it's a game mode, not "choosing" or "pairing")
        let effectiveGameMode = lane.gameMode;
        if (!effectiveGameMode && lane.deviceLocations && lane.deviceLocations.user) {
            const userLocation = lane.deviceLocations.user;
            // If location is a game mode (not "choosing", "pairing", or "main"), use it
            if (userLocation && userLocation !== 'choosing' && userLocation !== 'pairing' && userLocation !== 'main') {
                effectiveGameMode = userLocation;
            }
        }
        
        // Get colors based on game mode (default grey)
        const colors = this.getGameModeColors(effectiveGameMode);
        const hasCode = lane.pairingCode && !lane.closed;
        
        // Set CSS variables for card colors
        card.style.setProperty('--card-primary', colors.primary);
        card.style.setProperty('--card-secondary', colors.secondary);
        card.style.setProperty('--card-border', colors.border);
        card.style.setProperty('--card-border-hover', colors.borderHover || colors.border);
        card.style.setProperty('--card-border-active', colors.borderActive);
        card.style.setProperty('--card-gradient', colors.gradient);
        card.style.setProperty('--card-button-gradient', colors.buttonGradient || `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`);
        card.style.setProperty('--card-glow', colors.glow || `${colors.primary}40`);
        
        card.innerHTML = `
            <div class="lane-card-front">
                ${colors.icon ? `<div class="card-corner-icon card-corner-top-left">${colors.icon}</div>` : ''}
                ${colors.icon ? `<div class="card-corner-icon card-corner-bottom-right">${colors.icon}</div>` : ''}
                
                <div class="lane-card-title">${lane.laneId}</div>
                ${lane.deviceLocations && lane.deviceLocations.user ? `
                    <div class="lane-device-locations">
                        <span class="device-location">${this.formatLocation(lane.deviceLocations.user)}</span>
                    </div>
                ` : ''}
                
                <div class="lane-card-sides">
                    <div class="lane-side-info left">
                        <div class="side-label">User</div>
                        <div class="side-value ${lane.pairedDevices.user ? 'paired' : 'unpaired'}">
                            ${lane.pairedDevices.user ? '✓' : '○'}
                        </div>
                    </div>
                    <div class="lane-side-info right">
                        <div class="side-label">Proj</div>
                        <div class="side-value ${lane.pairedDevices.projector ? 'paired' : 'unpaired'}">
                            ${lane.pairedDevices.projector ? '✓' : '○'}
                        </div>
                    </div>
                </div>
                
                ${hasCode ? `
                    <div class="lane-pair-code">
                        <div class="pair-code-small">${lane.pairingCode}</div>
                    </div>
                ` : ''}
                
                ${lane.closed ? '<div class="lane-closed-overlay">CLOSED</div>' : ''}
            </div>
            
            <div class="lane-card-back">
                <div class="lane-card-back-title">${lane.laneId}</div>
                <div class="lane-card-back-content">
                    ${hasCode ? `
                        <div class="back-pair-code">
                            <div class="back-label">Pairing Code</div>
                            <div class="back-code">${lane.pairingCode}</div>
                        </div>
                    ` : ''}
                    
                    <div class="back-info">
                        <div class="back-info-item">
                            <span class="back-info-label">Status:</span>
                            <span class="back-info-value ${status}">${status === 'paired' ? 'Paired' : status === 'partial' ? 'Partial' : 'Offline'}</span>
                        </div>
                        <div class="back-info-item">
                            <span class="back-info-label">In Session:</span>
                            <span class="back-info-value">${lane.inSession ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                    
                    <div class="back-actions">
                        ${!hasCode ? `
                            <button class="card-button" onclick="adminDashboard.generatePairCode('${lane.laneId}')">
                                Generate Pair Code
                            </button>
                        ` : `
                            <button class="card-button card-button-danger" onclick="adminDashboard.closeLane('${lane.laneId}')">
                                Close Lane
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        // Add click handler to flip card (front)
        const cardFront = card.querySelector('.lane-card-front');
        cardFront.addEventListener('click', (e) => {
            if (e.target.closest('.card-button')) return; // Don't flip if clicking button
            card.classList.toggle('flipped');
        });
        
        // Add click handler to flip card back (back)
        const cardBack = card.querySelector('.lane-card-back');
        cardBack.addEventListener('click', (e) => {
            if (e.target.closest('.card-button')) return; // Don't flip if clicking button
            card.classList.remove('flipped'); // Always flip back to front
        });
        
        return card;
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
}

// Initialize dashboard
const adminDashboard = new AdminDashboard();

