// TRAXE Projector Title Screen
class ProjectorDisplay {
    constructor() {
        this.currentMode = null;
        this.ws = null;
        this.connectWebSocket();
        this.init();
    }
    
    init() {
        // Hide loading overlay after a short delay
        setTimeout(() => {
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }
        }, 1000);
    }
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8787/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Projector WebSocket connected');
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                if (message.type === 'setProjectorMode') {
                    this.changeMode(message.mode);
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected, attempting to reconnect...');
            // Attempt to reconnect after 3 seconds
            setTimeout(() => this.connectWebSocket(), 3000);
        };
    }
    
    changeMode(modeId) {
        if (this.currentMode === modeId) {
            return; // Already in this mode
        }
        
        this.currentMode = modeId;
        
        // Navigate to the appropriate game mode page
        const modeMap = {
            'main': '/projector', // Return to main title screen
            'classic': '/projector/classic',
            'bullseye-blitz': '/projector/bullseye-blitz',
            'xs-os': '/projector/xs-os',
            'clay-breaker': '/projector/clay-breaker',
            'killer': '/projector/killer',
            '10-pin': '/projector/10-pin'
        };
        
        const targetUrl = modeMap[modeId];
        if (targetUrl) {
            window.location.href = targetUrl;
        } else {
            console.warn('Unknown game mode:', modeId);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ProjectorDisplay();
});
