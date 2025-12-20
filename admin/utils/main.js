// TRAXE Admin Target Calibration
class TargetCalibration {
    constructor() {
        // Transform parameters
        this.transform = {
            translateX: 0,
            translateY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0, // degrees
            skewX: 0, // degrees
            skewY: 0  // degrees
        };
        
        this.laneId = 'lane1';
        
        // WebSocket for live updates to projector
        this.ws = null;
        
        // Default transform values (will be synced from projector)
        this.defaultTransform = {
            translateX: 0,
            translateY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            skewX: 0,
            skewY: 0
        };
        
        this.init();
    }
    
    init() {
        this.setupControls();
        this.connectWebSocket();
    }
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8787/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Admin WebSocket connected for live updates');
            // Request current transform from projector
            this.requestCurrentTransform();
        };
        
        this.ws.onmessage = (event) => {
            // Handle messages from server/projector
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'currentTargetTransform') {
                    // Received current transform from projector - only use if laneId matches
                    if (data.laneId === this.laneId) {
                        this.defaultTransform = { ...data.transform };
                        this.transform = { ...data.transform };
                        this.applyTransformToControls();
                        console.log('Synced transform from projector:', this.transform);
                    }
                } else {
                    console.log('Admin received message:', data);
                }
            } catch (e) {
                console.log('Admin received non-JSON message:', event.data);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('Admin WebSocket error:', error);
        };
        
        this.ws.onclose = () => {
            console.log('Admin WebSocket disconnected, attempting to reconnect...');
            setTimeout(() => this.connectWebSocket(), 3000);
        };
    }
    
    sendTransformUpdate() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type: 'updateTargetTransform',
                laneId: this.laneId,
                transform: { ...this.transform }
            };
            const messageStr = JSON.stringify(message);
            this.ws.send(messageStr);
            console.log('Sent transform update to server:', message);
        } else {
            console.warn('WebSocket not connected. ReadyState:', this.ws ? this.ws.readyState : 'null');
            // Try to reconnect if not connected
            if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                console.log('Attempting to reconnect WebSocket...');
                this.connectWebSocket();
            }
        }
    }
    
    requestCurrentTransform() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type: 'getCurrentTargetTransform',
                laneId: this.laneId
            };
            this.ws.send(JSON.stringify(message));
            console.log('Requested current transform from projector');
        }
    }
    
    setupControls() {
        // Setup all range sliders
        const controls = ['translateX', 'translateY', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY'];
        
        controls.forEach(control => {
            const slider = document.getElementById(control);
            const valueDisplay = document.getElementById(`${control}-value`);
            const decrementBtn = document.querySelector(`.btn-decrement[data-control="${control}"]`);
            const incrementBtn = document.querySelector(`.btn-increment[data-control="${control}"]`);
            
            // Update from slider
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.transform[control] = value;
                this.updateValueDisplay(control, value);
                this.sendTransformUpdate(); // Send live update to projector
            });
            
            // Decrement button
            decrementBtn.addEventListener('click', () => {
                const step = this.getStep(control);
                const newValue = Math.max(
                    parseFloat(slider.min),
                    this.transform[control] - step
                );
                this.transform[control] = newValue;
                slider.value = newValue;
                this.updateValueDisplay(control, newValue);
                this.sendTransformUpdate(); // Send live update to projector
            });
            
            // Increment button
            incrementBtn.addEventListener('click', () => {
                const step = this.getStep(control);
                const newValue = Math.min(
                    parseFloat(slider.max),
                    this.transform[control] + step
                );
                this.transform[control] = newValue;
                slider.value = newValue;
                this.updateValueDisplay(control, newValue);
                this.sendTransformUpdate(); // Send live update to projector
            });
        });
        
        // Lane ID input
        document.getElementById('laneId').addEventListener('input', (e) => {
            this.laneId = e.target.value || 'lane1';
            // Request current transform for new lane
            this.requestCurrentTransform();
        });
        
        // Reset button
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.resetTransform();
        });
        
        // Sync button
        document.getElementById('btn-sync').addEventListener('click', () => {
            this.requestCurrentTransform();
        });
    }
    
    resetTransform() {
        // Reset to default values (synced from projector)
        this.transform = { ...this.defaultTransform };
        this.applyTransformToControls();
        this.sendTransformUpdate();
        console.log('Reset transform to default:', this.transform);
    }
    
    applyTransformToControls() {
        Object.keys(this.transform).forEach(control => {
            const slider = document.getElementById(control);
            if (slider) {
                slider.value = this.transform[control];
                this.updateValueDisplay(control, this.transform[control]);
            }
        });
    }
    
    getStep(control) {
        const steps = {
            translateX: 1,
            translateY: 1,
            scaleX: 0.01,
            scaleY: 0.01,
            rotation: 0.1,
            skewX: 0.1,
            skewY: 0.1
        };
        return steps[control] || 1;
    }
    
    updateValueDisplay(control, value) {
        const valueDisplay = document.getElementById(`${control}-value`);
        if (valueDisplay) {
            if (control.includes('scale')) {
                valueDisplay.textContent = value.toFixed(2);
            } else if (control === 'rotation' || control.includes('skew')) {
                valueDisplay.textContent = value.toFixed(1);
            } else {
                valueDisplay.textContent = Math.round(value);
            }
        }
    }
    
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TargetCalibration();
});

