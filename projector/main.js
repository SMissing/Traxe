// TRAXE Projector Frontend
class TraxeProjector {
    constructor() {
        this.canvas = document.getElementById('target-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.markers = document.getElementById('markers');
        this.connectionStatus = document.getElementById('connection-status');
        this.calibrationStatus = document.getElementById('calibration-status');

        this.socket = null;
        this.isCalibrated = false;
        this.markersList = [];
        this.targetSize = 0.75; // 75% of min(screen dimension)
        this.markerLifetime = 3000; // 3 seconds

        this.initCanvas();
        this.connectToServer();
        this.setupEventListeners();
    }

    initCanvas() {
        // Set canvas to fullscreen
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Initial draw
        this.draw();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.draw();
    }

    connectToServer() {
        this.socket = io();

        this.socket.on('connect', () => {
            this.connectionStatus.textContent = 'Connected to server';
            this.connectionStatus.className = 'status-connected';
        });

        this.socket.on('disconnect', () => {
            this.connectionStatus.textContent = 'Disconnected from server';
            this.connectionStatus.className = 'status-disconnected';
        });

        this.socket.on('calibration-update', (data) => {
            this.handleCalibrationUpdate(data);
        });

        this.socket.on('tracking-update', (data) => {
            this.handleTrackingUpdate(data);
        });
    }

    setupEventListeners() {
        // Handle fullscreen on click
        document.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(console.log);
            }
        });
    }

    handleCalibrationUpdate(data) {
        this.isCalibrated = data.calibrated;
        if (this.isCalibrated) {
            this.calibrationStatus.textContent = 'Calibrated and ready!';
            this.calibrationStatus.className = 'status-calibrated';
        } else {
            this.calibrationStatus.textContent = 'Calibrating...';
            this.calibrationStatus.className = 'status-calibrating';
        }
        this.draw();
    }

    handleTrackingUpdate(data) {
        if (data.markers) {
            this.markersList = data.markers;
            this.draw();
        }
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.isCalibrated) {
            this.drawTarget();
            this.drawMarkers();
        } else {
            this.drawCalibrationScreen();
        }
    }

    drawTarget() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const size = Math.min(this.canvas.width, this.canvas.height) * this.targetSize;
        const halfSize = size / 2;

        // Draw target outline
        this.ctx.strokeStyle = '#808080';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(centerX - halfSize, centerY - halfSize, size, size);

        // Draw grid (8x8)
        this.ctx.strokeStyle = '#404040';
        this.ctx.lineWidth = 2;
        const gridSize = 8;

        for (let i = 1; i < gridSize; i++) {
            // Vertical lines
            const x = centerX - halfSize + (i * size / gridSize);
            this.ctx.beginPath();
            this.ctx.moveTo(x, centerY - halfSize);
            this.ctx.lineTo(x, centerY + halfSize);
            this.ctx.stroke();

            // Horizontal lines
            const y = centerY - halfSize + (i * size / gridSize);
            this.ctx.beginPath();
            this.ctx.moveTo(centerX - halfSize, y);
            this.ctx.lineTo(centerX + halfSize, y);
            this.ctx.stroke();
        }

        // Draw center dot
        this.ctx.fillStyle = '#808080';
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, 10, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    drawMarkers() {
        const now = Date.now();

        this.markersList.forEach(marker => {
            const age = now - marker.timestamp;
            if (age < this.markerLifetime) {
                const alpha = 1 - (age / this.markerLifetime);
                const thickness = Math.max(1, Math.floor(6 - age / 500));

                if (marker.type === 'hit') {
                    this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                    this.ctx.lineWidth = thickness;
                    this.ctx.beginPath();
                    this.ctx.arc(marker.x, marker.y, 35, 0, 2 * Math.PI);
                    this.ctx.stroke();
                } else if (marker.type === 'miss') {
                    this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                    this.ctx.lineWidth = thickness;
                    const size = 30;
                    this.ctx.beginPath();
                    this.ctx.moveTo(marker.x - size, marker.y - size);
                    this.ctx.lineTo(marker.x + size, marker.y + size);
                    this.ctx.moveTo(marker.x - size, marker.y + size);
                    this.ctx.lineTo(marker.x + size, marker.y - size);
                    this.ctx.stroke();
                }
            }
        });

        // Clean up old markers
        this.markersList = this.markersList.filter(marker =>
            now - marker.timestamp < this.markerLifetime
        );
    }

    drawCalibrationScreen() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('TRAXE CALIBRATION', this.canvas.width / 2, this.canvas.height / 2 - 100);

        this.ctx.font = '24px Arial';
        this.ctx.fillText('Waiting for tracker calibration...', this.canvas.width / 2, this.canvas.height / 2);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TraxeProjector();
});
