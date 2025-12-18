// TRAXE Projector Frontend
class TraxeProjector {
    constructor() {
        this.canvas = document.getElementById('target-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.serverLight = document.getElementById('server-light');
        this.trackerLight = document.getElementById('tracker-light');

        // Initialize tracker light (server light will be set in connectToServer)
        this.updateTrackerStatus(false);

        this.ws = null;
        this.markersList = [];
        this.particlesList = []; // Wood chip particles for hit effects
        this.targetSize = 0.75; // 75% of min(screen dimension)
        this.markerLifetime = 3000; // 3 seconds
        this.particleLifetime = 2000; // 2 seconds for particles
        this.missFlashDuration = 600; // 0.6 seconds
        this.lastMissTime = 0;
        this.lastHitTime = 0; // Track last hit to detect tracker connection
        this.trackerCheckInterval = null;
        this.lastFrameTime = Date.now(); // For particle physics

        // Visual config constants
        this.accentViolet = '#7C3AED';
        this.accentVioletGlow = '#A78BFA';

        // Create noise pattern for texture
        this.createNoisePattern();

        this.initCanvas();
        this.connectToServer();
        this.setupEventListeners();
        this.startAnimationLoop();
    }

    createNoisePattern() {
        const noiseSize = 128;
        this.noiseCanvas = document.createElement('canvas');
        this.noiseCanvas.width = noiseSize;
        this.noiseCanvas.height = noiseSize;
        const noiseCtx = this.noiseCanvas.getContext('2d');
        const imageData = noiseCtx.createImageData(noiseSize, noiseSize);
        
        for (let i = 0; i < imageData.data.length; i += 4) {
            const gray = Math.floor(Math.random() * 256);
            imageData.data[i] = gray;     // R
            imageData.data[i + 1] = gray; // G
            imageData.data[i + 2] = gray; // B
            imageData.data[i + 3] = 255;  // A
        }
        
        noiseCtx.putImageData(imageData, 0, 0);
        this.noisePattern = this.ctx.createPattern(this.noiseCanvas, 'repeat');
    }

    initCanvas() {
        // Set canvas to fullscreen
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    connectToServer() {
        this.updateConnectionStatus('connecting');

        try {
            // Connect to the same host that served this page
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.updateConnectionStatus('connected');
                this.updateTrackerStatus(false); // Initialize as no tracker
                this.startTrackerCheck();
                console.log('Connected to TRAXE server');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                this.updateConnectionStatus('disconnected');
                this.updateTrackerStatus(false);
                this.stopTrackerCheck();
                console.log('Disconnected from TRAXE server');

                // Auto-reconnect after 3 seconds
                setTimeout(() => {
                    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                        this.connectToServer();
                    }
                }, 3000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('disconnected');
            };

        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            this.updateConnectionStatus('disconnected');
        }
    }

    updateConnectionStatus(state) {
        // state: 'connecting', 'connected', 'disconnected'
        this.serverLight.className = 'status-light';
        if (state === 'connecting') {
            this.serverLight.classList.add('light-yellow');
        } else if (state === 'connected') {
            this.serverLight.classList.add('light-green');
        } else {
            this.serverLight.classList.add('light-red');
        }
    }

    updateTrackerStatus(connected) {
        // connected: true = green, false = red
        this.trackerLight.className = 'status-light';
        if (connected) {
            this.trackerLight.classList.add('light-green');
        } else {
            this.trackerLight.classList.add('light-red');
        }
    }

    startTrackerCheck() {
        // Check every 2 seconds if tracker is still connected
        // If no hits received for 5 seconds, mark tracker as disconnected
        this.trackerCheckInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastHit = now - this.lastHitTime;
            
            // If no hits for 5 seconds and we had a tracker before, mark as disconnected
            if (timeSinceLastHit > 5000 && this.lastHitTime > 0) {
                this.updateTrackerStatus(false);
                this.lastHitTime = 0; // Reset to avoid repeated checks
            }
        }, 2000);
    }

    stopTrackerCheck() {
        if (this.trackerCheckInterval) {
            clearInterval(this.trackerCheckInterval);
            this.trackerCheckInterval = null;
        }
    }

    handleMessage(data) {
        if (data.type === 'hit') {
            this.handleHit(data);
        } else if (data.type === 'connected') {
            console.log('Server connection confirmed:', data.message);
        }
    }

    handleHit(hitData) {
        const now = Date.now();
        this.lastHitTime = now; // Update last hit time to indicate tracker is active
        this.updateTrackerStatus(true);

        if (hitData.miss) {
            // Flash border for miss
            this.lastMissTime = now;
        } else {
            // Add hit marker
            this.addMarker(hitData.x, hitData.y, now, 'hit');
        }
    }

    addMarker(x, y, timestamp, type) {
        this.markersList.push({
            x: x,
            y: y,
            timestamp: timestamp,
            type: type
        });

        // Create wood chip particles for hit markers
        if (type === 'hit') {
            this.createWoodChipParticles(x, y, timestamp);
        }
    }

    createWoodChipParticles(normalizedX, normalizedY, timestamp) {
        const pixelCoords = this.normalizedToPixel(normalizedX, normalizedY);
        const particleCount = 8 + Math.floor(Math.random() * 6); // 8-13 particles

        for (let i = 0; i < particleCount; i++) {
            // Random angle for particle direction
            const angle = Math.random() * Math.PI * 2;
            // Random velocity (faster particles travel further)
            const speed = 20 + Math.random() * 40;
            // Random rotation speed
            const rotationSpeed = (Math.random() - 0.5) * 0.15;
            // Random size
            const size = 3 + Math.random() * 5;
            // Random rotation
            const rotation = Math.random() * Math.PI * 2;

            // Wood chip colors - browns with purple tint to match theme
            const isBrown = Math.random() > 0.5;
            const r = isBrown 
                ? 140 + Math.random() * 30  // Brown wood (higher red)
                : 160 + Math.random() * 20; // Purple-tinted wood (red > blue)
            const g = isBrown
                ? 90 + Math.random() * 20   // Brown wood (lower green)
                : 100 + Math.random() * 15; // Purple-tinted wood (lowest)
            const b = isBrown
                ? 60 + Math.random() * 15   // Brown wood (lowest)
                : 130 + Math.random() * 20; // Purple-tinted wood (blue > green)

            this.particlesList.push({
                x: pixelCoords.x,
                y: pixelCoords.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                rotation: rotation,
                rotationSpeed: rotationSpeed,
                size: size,
                timestamp: timestamp,
                r: Math.floor(r),
                g: Math.floor(g),
                b: Math.floor(b)
            });
        }
    }

    simulateRandomHit() {
        // Generate random normalized coordinates (0.0 to 1.0)
        const randomX = Math.random();
        const randomY = Math.random();
        
        // Simulate a hit (not a miss)
        const simulatedHit = {
            type: 'hit',
            x: randomX,
            y: randomY,
            miss: false
        };
        
        this.handleHit(simulatedHit);
        console.log(`Simulated hit at (${randomX.toFixed(3)}, ${randomY.toFixed(3)})`);
    }

    simulateMiss() {
        // Simulate a miss (hit outside target area)
        const simulatedMiss = {
            type: 'hit',
            miss: true
        };
        
        this.handleHit(simulatedMiss);
        console.log('Simulated miss');
    }

    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (event.key === 'f' || event.key === 'F') {
                // F key for fullscreen
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(console.log);
                }
            } else if (event.key === 'x' || event.key === 'X') {
                // X key to simulate random hit
                this.simulateRandomHit();
            } else if (event.key === 'm' || event.key === 'M') {
                // M key to simulate miss
                this.simulateMiss();
            } else if (event.key === 'Escape') {
                // ESC handled by browser for exiting fullscreen
                // We don't need to do anything special here
            }
        });

        // Double-click to toggle fullscreen
        document.addEventListener('dblclick', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(console.log);
            } else {
                document.exitFullscreen().catch(console.log);
            }
        });
    }

    startAnimationLoop() {
        const animate = () => {
            this.draw();
            requestAnimationFrame(animate);
        };
        animate();
    }

    draw() {
        const now = Date.now();

        // Clear canvas (transparent to show background)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw target
        this.drawTarget();

        // Draw miss flash if active
        this.drawMissFlash(now);

        // Draw markers
        this.drawMarkers(now);
    }

    drawTarget() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const size = Math.min(this.canvas.width, this.canvas.height) * this.targetSize;
        const halfSize = size / 2;
        const targetLeft = centerX - halfSize;
        const targetTop = centerY - halfSize;

        // Save context state
        this.ctx.save();

        // Fill target area with gradient (dark slate -> near black)
        const bgGradient = this.ctx.createLinearGradient(targetLeft, targetTop, targetLeft + size, targetTop + size);
        bgGradient.addColorStop(0, '#1a1a1f');
        bgGradient.addColorStop(0.5, '#0f0f12');
        bgGradient.addColorStop(1, '#050508');
        this.ctx.fillStyle = bgGradient;
        this.ctx.fillRect(targetLeft, targetTop, size, size);

        // Draw inner vignette (radial gradient - brighter in center)
        const vignetteGradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, halfSize);
        vignetteGradient.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
        vignetteGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.01)');
        vignetteGradient.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
        this.ctx.fillStyle = vignetteGradient;
        this.ctx.fillRect(targetLeft, targetTop, size, size);

        // Draw noise texture pattern
        this.ctx.globalAlpha = 0.04;
        this.ctx.fillStyle = this.noisePattern;
        this.ctx.fillRect(targetLeft, targetTop, size, size);
        this.ctx.globalAlpha = 1.0;

        // Draw grid (8x8) - thin, low-contrast lines
        this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.25)';
        this.ctx.lineWidth = 1.25;
        const gridSize = 8;

        for (let i = 1; i < gridSize; i++) {
            // Vertical lines
            const x = targetLeft + (i * size / gridSize);
            this.ctx.beginPath();
            this.ctx.moveTo(x, targetTop);
            this.ctx.lineTo(x, targetTop + size);
            this.ctx.stroke();

            // Horizontal lines
            const y = targetTop + (i * size / gridSize);
            this.ctx.beginPath();
            this.ctx.moveTo(targetLeft, y);
            this.ctx.lineTo(targetLeft + size, y);
            this.ctx.stroke();
        }

        // Draw thin inner border line for depth
        this.ctx.strokeStyle = 'rgba(80, 80, 80, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(targetLeft + 2, targetTop + 2, size - 4, size - 4);

        // Draw outer border with violet glow
        this.ctx.strokeStyle = 'rgba(120, 120, 120, 0.6)';
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowColor = this.accentVioletGlow;
        this.ctx.shadowBlur = 8;
        this.ctx.strokeRect(targetLeft, targetTop, size, size);
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';

        // Draw bullseye-style gradient rings (smaller than target square)
        const bullseyeSize = size * 0.85; // 85% of target size
        const bullseyeRadius = bullseyeSize / 2;
        const bullseyeGradient = this.ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, bullseyeRadius
        );
        
        // Create exactly 5 rings alternating light grey and slate
        // Ring 1 (center/bullseye): light grey
        bullseyeGradient.addColorStop(0, 'rgba(140, 140, 140, 0.2)');      // Center - light grey
        bullseyeGradient.addColorStop(0.19, 'rgba(140, 140, 140, 0.2)');   // End of ring 1
        
        // Ring 2: slate
        bullseyeGradient.addColorStop(0.2, 'rgba(70, 70, 75, 0.12)');     // Start of ring 2 - slate
        bullseyeGradient.addColorStop(0.39, 'rgba(70, 70, 75, 0.12)');    // End of ring 2
        
        // Ring 3: light grey
        bullseyeGradient.addColorStop(0.4, 'rgba(130, 130, 130, 0.18)');  // Start of ring 3 - light grey
        bullseyeGradient.addColorStop(0.59, 'rgba(130, 130, 130, 0.18)'); // End of ring 3
        
        // Ring 4: slate
        bullseyeGradient.addColorStop(0.6, 'rgba(65, 65, 70, 0.1)');      // Start of ring 4 - slate
        bullseyeGradient.addColorStop(0.79, 'rgba(65, 65, 70, 0.1)');     // End of ring 4
        
        // Ring 5 (outer): light grey
        bullseyeGradient.addColorStop(0.8, 'rgba(120, 120, 120, 0.15)');  // Start of ring 5 - light grey
        bullseyeGradient.addColorStop(1, 'rgba(120, 120, 120, 0.15)');    // End of ring 5
        
        this.ctx.fillStyle = bullseyeGradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, bullseyeRadius, 0, 2 * Math.PI);
        this.ctx.fill();

        // Restore context state
        this.ctx.restore();
    }

    drawMissFlash(now) {
        if (now - this.lastMissTime < this.missFlashDuration) {
            const progress = (now - this.lastMissTime) / this.missFlashDuration;
            const alpha = (1 - progress) * (1 - progress); // Softer fade curve

            this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            this.ctx.lineWidth = 4.5;
            this.ctx.strokeRect(10, 10, this.canvas.width - 20, this.canvas.height - 20);
        }
    }

    drawMarkers(now) {
        // Clean up old markers first
        this.markersList = this.markersList.filter(marker =>
            now - marker.timestamp < this.markerLifetime
        );

        // Update and clean up old particles
        const deltaTime = this.lastFrameTime > 0 
            ? Math.min(now - this.lastFrameTime, 50) / 1000 // Cap at 50ms, convert to seconds
            : 0.016; // Default to ~60fps on first frame
        this.lastFrameTime = now;
        
        this.particlesList = this.particlesList.filter(particle => {
            const age = now - particle.timestamp;
            if (age < this.particleLifetime) {
                // Update particle position (with slight deceleration)
                particle.x += particle.vx * deltaTime;
                particle.y += particle.vy * deltaTime;
                particle.rotation += particle.rotationSpeed * deltaTime * 60; // Scale rotation speed
                
                // Apply deceleration
                particle.vx *= 0.98;
                particle.vy *= 0.98;
                
                return true; // Keep particle
            }
            return false; // Remove old particle
        });

        // Draw particles first (behind markers)
        this.particlesList.forEach(particle => {
            const age = now - particle.timestamp;
            const progress = age / this.particleLifetime;
            const alpha = (1 - progress) * (1 - progress); // Fade out

            this.ctx.save();
            this.ctx.translate(particle.x, particle.y);
            this.ctx.rotate(particle.rotation);
            
            // Draw wood chip as a rotated rectangle
            const chipWidth = particle.size * 1.5;
            const chipHeight = particle.size * 0.8;
            
            // Use RGB values directly with alpha
            this.ctx.fillStyle = `rgba(${particle.r}, ${particle.g}, ${particle.b}, ${alpha})`;
            
            // Draw wood chip shape (rectangle with slightly rounded corners using path)
            const cornerRadius = 1.5;
            this.ctx.beginPath();
            const w = chipWidth / 2;
            const h = chipHeight / 2;
            this.ctx.moveTo(-w + cornerRadius, -h);
            this.ctx.lineTo(w - cornerRadius, -h);
            this.ctx.quadraticCurveTo(w, -h, w, -h + cornerRadius);
            this.ctx.lineTo(w, h - cornerRadius);
            this.ctx.quadraticCurveTo(w, h, w - cornerRadius, h);
            this.ctx.lineTo(-w + cornerRadius, h);
            this.ctx.quadraticCurveTo(-w, h, -w, h - cornerRadius);
            this.ctx.lineTo(-w, -h + cornerRadius);
            this.ctx.quadraticCurveTo(-w, -h, -w + cornerRadius, -h);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Add subtle outline
            this.ctx.strokeStyle = `rgba(60, 40, 30, ${alpha * 0.5})`;
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();
            
            this.ctx.restore();
        });

        // Draw markers on top
        this.markersList.forEach(marker => {
            const age = now - marker.timestamp;
            if (age < this.markerLifetime) {
                const progress = age / this.markerLifetime;
                const alpha = 1 - progress;
                const thickness = Math.max(1, Math.floor(6 - age / 500));

                // Convert normalized coordinates to canvas coordinates
                const pixelCoords = this.normalizedToPixel(marker.x, marker.y);

                if (marker.type === 'hit') {
                    // Draw hit: circle with burst effect (violet-white)
                    this.ctx.strokeStyle = `rgba(220, 210, 255, ${alpha})`;
                    this.ctx.lineWidth = thickness;
                    this.ctx.beginPath();
                    this.ctx.arc(pixelCoords.x, pixelCoords.y, 35, 0, 2 * Math.PI);
                    this.ctx.stroke();

                    // Draw burst lines
                    const burstLength = 15 * (1 - progress);
                    for (let i = 0; i < 4; i++) {
                        const angle = (i * Math.PI) / 2;
                        const endX = pixelCoords.x + Math.cos(angle) * burstLength;
                        const endY = pixelCoords.y + Math.sin(angle) * burstLength;
                        this.ctx.beginPath();
                        this.ctx.moveTo(pixelCoords.x, pixelCoords.y);
                        this.ctx.lineTo(endX, endY);
                        this.ctx.stroke();
                    }
                }
            }
        });
    }

    normalizedToPixel(x, y) {
        // Convert normalized coordinates (0.0-1.0) to pixel coordinates within target square
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const size = Math.min(this.canvas.width, this.canvas.height) * this.targetSize;
        const halfSize = size / 2;

        const targetLeft = centerX - halfSize;
        const targetTop = centerY - halfSize;

        return {
            x: targetLeft + (x * size),
            y: targetTop + (y * size)
        };
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TraxeProjector();
    
    // Hide loading overlay after page is fully loaded
    window.addEventListener('load', () => {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            // Small delay to ensure smooth transition
            setTimeout(() => {
                loadingOverlay.classList.add('hidden');
            }, 300);
        }
    });
});
