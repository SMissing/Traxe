// TRAXE User Classic Mode - Test Hit Keys
class ClassicUserPage {
    constructor() {
        this.trackerWs = null; // WebSocket for test hits (tracker endpoint)
        this.controlWs = null; // WebSocket for projector control and hit events (ws endpoint)
        this.laneId = 'lane1'; // Default lane ID
        this.currentPoints = 0; // Current points display value
        
        // Map keys to normalized coordinates (0.0 to 1.0, where 0.5, 0.5 is center)
        // Target is a square, so we'll map keys to a 3x3 grid
        this.keyMap = {
            'q': { x: 0.25, y: 0.25, label: 'top-left' },      // Top-left
            'w': { x: 0.5, y: 0.25, label: 'top-center' },    // Top-center
            'e': { x: 0.75, y: 0.25, label: 'top-right' },    // Top-right
            'a': { x: 0.25, y: 0.5, label: 'middle-left' },    // Middle-left
            's': { x: 0.5, y: 0.5, label: 'center (bullseye)' }, // Center (bullseye)
            'd': { x: 0.75, y: 0.5, label: 'middle-right' },   // Middle-right
            'z': { x: 0.25, y: 0.75, label: 'bottom-left' },   // Bottom-left
            'x': { x: 0.5, y: 0.75, label: 'bottom-center' },  // Bottom-center
            'c': { x: 0.75, y: 0.75, label: 'bottom-right' }   // Bottom-right
        };
        
        this.connectWebSockets();
        this.setupKeyboardListeners();
        this.setupBackButton();
        this.setupPointsDisplay();
    }
    
    connectWebSockets() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        
        // Connect to tracker endpoint for test hits
        const trackerUrl = `${protocol}//${window.location.hostname}:8787/tracker`;
        this.trackerWs = new WebSocket(trackerUrl);
        
        this.trackerWs.onopen = () => {
            console.log('Test hit WebSocket connected to tracker endpoint');
        };
        
        this.trackerWs.onerror = (error) => {
            console.error('Tracker WebSocket error:', error);
        };
        
        this.trackerWs.onclose = () => {
            console.log('Tracker WebSocket disconnected, attempting to reconnect...');
            setTimeout(() => this.connectWebSockets(), 3000);
        };
        
        // Connect to ws endpoint for projector control
        const controlUrl = `${protocol}//${window.location.hostname}:8787/ws`;
        this.controlWs = new WebSocket(controlUrl);
        
        this.controlWs.onopen = () => {
            console.log('Projector control WebSocket connected');
        };
        
        this.controlWs.onerror = (error) => {
            console.error('Control WebSocket error:', error);
        };
        
        this.controlWs.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                // Handle projector mode changes
                if (message.type === 'setProjectorMode') {
                    // This is handled elsewhere, but we can ignore it here
                }
                // Handle hit events from projector
                else if (message.type === 'hit') {
                    this.handleHitEvent(message);
                }
            } catch (error) {
                console.error('Error parsing control message:', error);
            }
        };
        
        this.controlWs.onclose = () => {
            console.log('Control WebSocket disconnected, attempting to reconnect...');
            setTimeout(() => this.connectWebSockets(), 3000);
        };
    }
    
    calculatePoints(normalizedX, normalizedY) {
        // Same calculation as in projector/classic/main.js
        const centerX = 0.5;
        const centerY = 0.5;
        const dx = normalizedX - centerX;
        const dy = normalizedY - centerY;
        const distanceFromCenterNormalized = Math.sqrt(dx * dx + dy * dy);
        
        const bullseyeRadiusNormalized = 0.425; // 0.85 / 2
        const normalizedDistance = distanceFromCenterNormalized / bullseyeRadiusNormalized;
        
        // If outside the bullseye circle entirely, return 0 points
        if (normalizedDistance > 1.0) {
            return 0;
        }
        
        // Determine which ring based on normalized distance
        if (normalizedDistance <= 0.19) {
            return 5;
        } else if (normalizedDistance <= 0.39) {
            return 4;
        } else if (normalizedDistance <= 0.59) {
            return 3;
        } else if (normalizedDistance <= 0.79) {
            return 2;
        } else {
            return 1;
        }
    }
    
    handleHitEvent(hitData) {
        if (hitData.miss) {
            return; // Don't update points for misses
        }
        
        const points = this.calculatePoints(hitData.x, hitData.y);
        if (points > 0) {
            this.updatePointsDisplay(points);
        }
    }
    
    updatePointsDisplay(points) {
        this.currentPoints = points;
        const pointsDisplay = document.getElementById('points-display');
        if (pointsDisplay) {
            pointsDisplay.textContent = points;
            pointsDisplay.classList.add('points-updated');
            
            // Remove the animation class after animation completes
            setTimeout(() => {
                pointsDisplay.classList.remove('points-updated');
            }, 300);
        }
    }
    
    setupPointsDisplay() {
        const pointsDisplay = document.getElementById('points-display');
        if (pointsDisplay) {
            pointsDisplay.textContent = '0';
        }
    }
    
    sendProjectorModeChange(modeId) {
        if (this.controlWs && this.controlWs.readyState === WebSocket.OPEN) {
            const message = {
                type: 'setProjectorMode',
                mode: modeId
            };
            this.controlWs.send(JSON.stringify(message));
            console.log('Sent projector mode change:', modeId);
        } else {
            console.warn('Control WebSocket not connected, cannot send projector mode change');
        }
    }
    
    sendTestHit(key) {
        const hitData = this.keyMap[key.toLowerCase()];
        if (!hitData) {
            return; // Invalid key
        }
        
        if (this.trackerWs && this.trackerWs.readyState === WebSocket.OPEN) {
            const now = Date.now();
            const event = {
                type: 'rawHit',
                laneId: this.laneId,
                x: hitData.x,
                y: hitData.y,
                t: now,
                meta: {
                    source: 'test-keys',
                    confidence: 1.0
                }
            };
            
            this.trackerWs.send(JSON.stringify(event));
            console.log(`Sent test hit: ${key.toUpperCase()} - ${hitData.label} at (${hitData.x.toFixed(2)}, ${hitData.y.toFixed(2)})`);
        } else {
            console.warn('Tracker WebSocket not connected, cannot send test hit');
        }
    }
    
    setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            
            // Check if it's one of our test hit keys
            if (this.keyMap[key]) {
                e.preventDefault(); // Prevent default behavior
                this.sendTestHit(key);
                
                // Visual feedback - briefly highlight the key in the instructions
                this.highlightKey(key);
            }
        });
    }
    
    highlightKey(key) {
        // Find the key cell in the grid and add a highlight class
        const keyCell = document.querySelector(`.key-cell[data-key="${key.toLowerCase()}"]`);
        if (keyCell) {
            keyCell.classList.add('key-pressed');
            setTimeout(() => {
                keyCell.classList.remove('key-pressed');
            }, 200);
        }
    }
    
    setupBackButton() {
        const backButton = document.getElementById('back-button');
        if (backButton) {
            backButton.addEventListener('click', (e) => {
                // Send projector back to main title screen
                this.sendProjectorModeChange('main');
                
                // Navigate user back to game modes
                window.location.href = '/user';
            });
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ClassicUserPage();
});

