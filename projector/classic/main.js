// TRAXE Projector Frontend
class TraxeProjector {
    constructor() {
        this.canvas = document.getElementById('target-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.serverLight = document.getElementById('server-light');
        this.trackerLight = document.getElementById('tracker-light');
        this.logo = document.getElementById('traxe-logo');
        this.statusDiv = document.getElementById('status');

        // Initialize tracker light (server light will be set in connectToServer)
        this.updateTrackerStatus(false);

        this.ws = null;
        this.markersList = [];
        this.particlesList = []; // Wood chip particles for hit effects
        this.pointsList = []; // Floating points display
        this.targetSize = 0.75; // 75% of min(screen dimension)
        this.markerLifetime = 3000; // 3 seconds
        this.particleLifetime = 2000; // 2 seconds for particles
        this.pointsLifetime = 2000; // 2 seconds for points (1s visible, 1s fade)
        this.pointsFadeStart = 1000; // Start fading after 1 second
        this.missFlashDuration = 600; // 0.6 seconds
        this.impactFlashDuration = 150; // 0.15 seconds for impact flash
        this.dustPoofDuration = 800; // 0.8 seconds for dust poof
        this.shakeDuration = 400; // 0.4 seconds for screen shake
        this.lastMissTime = 0;
        this.lastHitTime = 0; // Track last hit time (for other purposes)
        this.impactFlash = null; // { x, y, timestamp } for impact flash
        this.dustPoof = null; // { x, y, timestamp } for dust poof
        this.shakeStartTime = 0; // Timestamp when shake started
        this.shakeIntensity = 0; // Shake intensity (0-1, based on distance from center)
        this.isDoorSlamShake = false; // Flag for door slam shake (more intense)
        this.trackerCount = 0; // Actual tracker count from server
        this.lastFrameTime = Date.now(); // For particle physics
        this.gravity = 300; // Gravity acceleration (pixels per second squared)
        this.bullseyeDoor = null; // { timestamp, state: 'closing' | 'closed' | 'opening', particlesCreated: boolean } for bullseye door animation
        this.bullseyeText = null; // { timestamp } for bullseye text display
        this.backgroundStyle = 'B'; // 'A' = image background, 'B' = gradient background

        // Visual config constants
        this.accentViolet = '#7C3AED';
        this.accentVioletGlow = '#A78BFA';
        
        // Target transform (loaded from preset)
        this.targetTransform = {
            translateX: 0,
            translateY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            skewX: 0,
            skewY: 0
        };
        this.laneId = 'lane1'; // Default, should match tracker laneId

        // Create noise pattern for texture
        this.createNoisePattern();

        this.initCanvas();
        this.setBackgroundStyleB();
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
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.updateLogoSize();
        });
        // Update logo size after initial canvas setup
        setTimeout(() => this.updateLogoSize(), 0);
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    updateLogoSize() {
        if (!this.logo || !this.statusDiv) return;

        // Calculate target position (same logic as in drawTarget)
        const centerY = this.canvas.height / 2;
        const size = Math.min(this.canvas.width, this.canvas.height) * this.targetSize;
        const halfSize = size / 2;
        const targetTop = centerY - halfSize;

        // Calculate available space between top of screen and top of target
        const availableSpace = targetTop;

        // Scale logo based on available space (use 50% of available space, with min/max constraints)
        const minLogoHeight = 32; // Minimum logo height in pixels
        const maxLogoHeight = 500; // Maximum logo height in pixels
        const logoHeight = Math.max(minLogoHeight, Math.min(maxLogoHeight, availableSpace * 0.5));

        // Center logo vertically in the available space
        const logoTop = availableSpace / 2 - logoHeight / 2;

        // Apply styles
        this.logo.style.height = `${logoHeight}px`;
        this.statusDiv.style.top = `${logoTop}px`;
    }

    connectToServer() {
        this.updateConnectionStatus('connecting');

        try {
            // Connect to the same host that served this page
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Use explicit port 8787 to match server
            const host = window.location.hostname || 'localhost';
            const wsUrl = `${protocol}//${host}:8787/ws`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.updateConnectionStatus('connected');
                this.updateTrackerStatus(false); // Initialize as no tracker (will be updated by status message)
                console.log('Connected to TRAXE server');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // Handle getCurrentTargetTransform request
                    if (data.type === 'getCurrentTargetTransform') {
                        if (data.laneId === this.laneId) {
                            // Send current transform back
                            const response = {
                                type: 'currentTargetTransform',
                                laneId: this.laneId,
                                transform: { ...this.targetTransform }
                            };
                            this.ws.send(JSON.stringify(response));
                            console.log('Sent current transform:', this.targetTransform);
                        }
                    } else {
                        this.handleMessage(data);
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                this.updateConnectionStatus('disconnected');
                this.updateTrackerStatus(false);
                this.trackerCount = 0;
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

    handleMessage(data) {
        if (data.type === 'hit') {
            this.handleHit(data);
        } else if (data.type === 'connected') {
            console.log('Server connection confirmed:', data.message);
        } else if (data.type === 'status') {
            // Update tracker status based on actual tracker count from server
            this.trackerCount = data.trackers || 0;
            this.updateTrackerStatus(this.trackerCount > 0);
        } else if (data.type === 'setProjectorMode') {
            // Handle projector mode changes (e.g., going back to main)
            if (data.mode === 'main') {
                window.location.href = '/projector';
            } else {
                // For other modes, navigate to the appropriate page
                const modeMap = {
                    'classic': '/projector/classic',
                    'bullseye-blitz': '/projector/bullseye-blitz',
                    'xs-os': '/projector/xs-os',
                    'clay-breaker': '/projector/clay-breaker',
                    'killer': '/projector/killer',
                    '10-pin': '/projector/10-pin'
                };
                const targetUrl = modeMap[data.mode];
                if (targetUrl) {
                    window.location.href = targetUrl;
                }
            }
        } else if (data.type === 'updateTargetTransform') {
            // Handle live transform updates from admin calibration page
            console.log('Received transform update:', data);
            console.log('Current laneId:', this.laneId, 'Update laneId:', data.laneId);
            if (data.laneId === this.laneId) {
                const oldTransform = { ...this.targetTransform };
                this.targetTransform = { ...data.transform };
                console.log('Target transform updated live for lane', this.laneId);
                console.log('Old transform:', oldTransform);
                console.log('New transform:', this.targetTransform);
                // Force a redraw by triggering the animation loop
                // (The loop should already be running, but this ensures it picks up changes)
            } else {
                console.log('Transform update ignored - lane mismatch. Expected:', this.laneId, 'Got:', data.laneId);
            }
        } else {
            console.log('Unhandled message type:', data.type);
        }
    }

    handleHit(hitData) {
        const now = Date.now();
        this.lastHitTime = now; // Update last hit time (for other purposes)

        if (hitData.miss) {
            // Flash border for miss
            this.lastMissTime = now;
        } else {
            // Add hit marker
            this.addMarker(hitData.x, hitData.y, now, 'hit');
            // Create impact flash
            const pixelCoords = this.normalizedToPixel(hitData.x, hitData.y);
            this.impactFlash = {
                x: pixelCoords.x,
                y: pixelCoords.y,
                timestamp: now
            };
            // Create dust poof
            this.dustPoof = {
                x: pixelCoords.x,
                y: pixelCoords.y,
                timestamp: now
            };
            
            // Calculate distance from center (normalized coordinates: center is 0.5, 0.5)
            const centerX = 0.5;
            const centerY = 0.5;
            const dx = hitData.x - centerX;
            const dy = hitData.y - centerY;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
            // Normalize distance (max distance from center is ~0.707 for corners)
            const normalizedDistance = Math.min(1, distanceFromCenter / 0.707);
            // Invert so center (0 distance) = 1.0 intensity, edge (1.0 distance) = 0.2 intensity
            this.shakeIntensity = 1.0 - (normalizedDistance * 0.8); // Range: 1.0 (center) to 0.2 (edge)
            
            // Trigger screen shake
            this.shakeStartTime = now;
            
            // Calculate and display points (only if hit is within a ring)
            const points = this.calculatePoints(hitData.x, hitData.y);
            if (points > 0) {
                // Check for bullseye (5 points) and trigger door effect
                // Don't show ghostly points for bullseye - they'll be on the door instead
                if (points === 5) {
                    this.triggerBullseyeEffect(now);
                } else {
                    // Position points at the top of the hit circle (radius 35)
                    const pointsY = pixelCoords.y - 35;
                    this.addPointsDisplay(pixelCoords.x, pointsY, points, now);
                }
            }
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

    calculatePoints(normalizedX, normalizedY) {
        // Calculate distance from center (normalized coordinates: center is 0.5, 0.5)
        const centerX = 0.5;
        const centerY = 0.5;
        const dx = normalizedX - centerX;
        const dy = normalizedY - centerY;
        const distanceFromCenterNormalized = Math.sqrt(dx * dx + dy * dy);
        
        // Convert normalized distance to distance within bullseye
        // The bullseye radius in normalized space is: (size * 0.85 / 2) / size = 0.425
        // Bullseye radius in normalized space: 0.85 / 2 = 0.425
        const bullseyeRadiusNormalized = 0.425; // 0.85 / 2
        const normalizedDistance = distanceFromCenterNormalized / bullseyeRadiusNormalized;
        
        // If outside the bullseye circle entirely, return 0 points
        if (normalizedDistance > 1.0) {
            return 0;
        }
        
        // Determine which ring based on normalized distance
        // Ring 1 (bullseye): 0 to 0.19 = 5 points
        // Ring 2: 0.2 to 0.39 = 4 points
        // Ring 3: 0.4 to 0.59 = 3 points
        // Ring 4: 0.6 to 0.79 = 2 points
        // Ring 5: 0.8 to 1.0 = 1 point
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

    addPointsDisplay(x, y, points, timestamp) {
        // Generate random wiggle seeds for organic, ghostly movement
        const wiggleSeedX = Math.random() * Math.PI * 2; // Random phase for X wiggle
        const wiggleSeedY = Math.random() * Math.PI * 2; // Random phase for Y wiggle
        const opacitySeed = Math.random() * Math.PI * 2; // Random phase for opacity pulse
        
        this.pointsList.push({
            x: x,
            y: y,
            points: points,
            timestamp: timestamp,
            startY: y, // Store starting Y position for floating animation
            wiggleSeedX: wiggleSeedX, // Random phase for X wiggle
            wiggleSeedY: wiggleSeedY, // Random phase for Y wiggle
            opacitySeed: opacitySeed // Random phase for opacity pulse
        });
    }

    createWoodChipParticles(normalizedX, normalizedY, timestamp) {
        const pixelCoords = this.normalizedToPixel(normalizedX, normalizedY);
        const particleCount = 10 + Math.floor(Math.random() * 8); // 10-17 particles (slightly more variety)

        for (let i = 0; i < particleCount; i++) {
            // Random angle for particle direction
            const angle = Math.random() * Math.PI * 2;
            // Random velocity (faster particles travel further)
            const speed = 25 + Math.random() * 50;
            // Random rotation speed
            const rotationSpeed = (Math.random() - 0.5) * 0.2;
            // Random size
            const size = 2 + Math.random() * 6;
            // Random rotation
            const rotation = Math.random() * Math.PI * 2;
            
            // Particle type: 0 = chip, 1 = splinter, 2 = dust
            const typeRoll = Math.random();
            const particleType = typeRoll < 0.5 ? 'chip' : (typeRoll < 0.85 ? 'splinter' : 'dust');
            
            // Z-index for layering (0 = back, 1 = front)
            const zIndex = Math.random() > 0.3 ? 0 : 1;

            // Color palette based on background style
            const colorVariation = Math.random();
            let baseR, baseG, baseB;
            
            if (this.backgroundStyle === 'B') {
                // Style B: Black and grey palette
                if (colorVariation < 0.4) {
                    // Dark grey
                    baseR = 30 + Math.random() * 20;  // 30-50
                    baseG = 30 + Math.random() * 20;  // 30-50
                    baseB = 30 + Math.random() * 20;  // 30-50
                } else if (colorVariation < 0.7) {
                    // Medium grey
                    baseR = 50 + Math.random() * 20;  // 50-70
                    baseG = 50 + Math.random() * 20;  // 50-70
                    baseB = 50 + Math.random() * 20;  // 50-70
                } else if (colorVariation < 0.9) {
                    // Light grey
                    baseR = 70 + Math.random() * 20;  // 70-90
                    baseG = 70 + Math.random() * 20;  // 70-90
                    baseB = 70 + Math.random() * 20;  // 70-90
                } else {
                    // Very dark grey/black
                    baseR = 15 + Math.random() * 15;  // 15-30
                    baseG = 15 + Math.random() * 15;  // 15-30
                    baseB = 15 + Math.random() * 15;  // 15-30
                }
            } else {
                // Style A: Dark oak color palette - rich dark browns with varied undertones
                if (colorVariation < 0.4) {
                    // Standard dark oak - rich dark brown
                    baseR = 55 + Math.random() * 20;  // 55-75
                    baseG = 35 + Math.random() * 15;  // 35-50
                    baseB = 25 + Math.random() * 15;  // 25-40
                } else if (colorVariation < 0.7) {
                    // Reddish dark oak - warmer tones
                    baseR = 65 + Math.random() * 20;  // 65-85
                    baseG = 40 + Math.random() * 15;   // 40-55
                    baseB = 30 + Math.random() * 12;  // 30-42
                } else if (colorVariation < 0.9) {
                    // Golden dark oak - amber undertones
                    baseR = 60 + Math.random() * 18;  // 60-78
                    baseG = 45 + Math.random() * 15;  // 45-60
                    baseB = 28 + Math.random() * 10;  // 28-38
                } else {
                    // Cool dark oak - slight grey/purple tones
                    baseR = 50 + Math.random() * 15;  // 50-65
                    baseG = 38 + Math.random() * 12;  // 38-50
                    baseB = 35 + Math.random() * 15;  // 35-50
                }
            }

            // Hue shift for gradient variation (slight color shifts)
            const hueShift = (Math.random() - 0.5) * 0.15; // -0.15 to 0.15
            const r = Math.max(20, Math.min(100, baseR + hueShift * 20));
            const g = Math.max(15, Math.min(70, baseG + hueShift * 15));
            const b = Math.max(10, Math.min(60, baseB + hueShift * 10));

            // Shape variation parameters
            const shapeVariation = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
            const aspectRatio = particleType === 'splinter' 
                ? 0.4 + Math.random() * 0.2  // Long and thin
                : particleType === 'dust'
                ? 0.8 + Math.random() * 0.2  // More square
                : 0.5 + Math.random() * 0.3; // Medium

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
                b: Math.floor(b),
                baseR: Math.floor(baseR), // Store base color for gradient variation
                baseG: Math.floor(baseG),
                baseB: Math.floor(baseB),
                hueShift: hueShift, // Store hue shift for gradient
                type: particleType,
                zIndex: zIndex,
                shapeVariation: shapeVariation,
                aspectRatio: aspectRatio,
                prevX: pixelCoords.x, // For motion blur
                prevY: pixelCoords.y,
                trailLength: 0 // Track trail length for optimization
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

    simulateBullseyeHit() {
        // Simulate a hit at the center (bullseye)
        const bullseyeHit = {
            type: 'hit',
            x: 0.5, // Center X
            y: 0.5, // Center Y
            miss: false
        };
        
        this.handleHit(bullseyeHit);
        console.log('Simulated bullseye hit at center (0.5, 0.5)');
    }

    simulateEdgeHit() {
        // Simulate a hit at the edge of the target
        // Pick a random edge position (0.0-0.1 or 0.9-1.0 on one axis, random on the other)
        const edgeSide = Math.floor(Math.random() * 4); // 0-3 for 4 edges
        let edgeX, edgeY;
        
        if (edgeSide === 0) {
            // Top edge
            edgeX = Math.random();
            edgeY = 0.05 + Math.random() * 0.05; // 0.05 to 0.1
        } else if (edgeSide === 1) {
            // Right edge
            edgeX = 0.9 + Math.random() * 0.1; // 0.9 to 1.0
            edgeY = Math.random();
        } else if (edgeSide === 2) {
            // Bottom edge
            edgeX = Math.random();
            edgeY = 0.9 + Math.random() * 0.1; // 0.9 to 1.0
        } else {
            // Left edge
            edgeX = 0.05 + Math.random() * 0.05; // 0.05 to 0.1
            edgeY = Math.random();
        }
        
        const edgeHit = {
            type: 'hit',
            x: edgeX,
            y: edgeY,
            miss: false
        };
        
        this.handleHit(edgeHit);
        console.log(`Simulated edge hit at (${edgeX.toFixed(3)}, ${edgeY.toFixed(3)})`);
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
            } else if (event.key === 'z' || event.key === 'Z') {
                // Z key to simulate bullseye hit
                this.simulateBullseyeHit();
            } else if (event.key === 'c' || event.key === 'C') {
                // C key to simulate edge hit
                this.simulateEdgeHit();
            } else if (event.key === 'a' || event.key === 'A') {
                // A key to toggle background style
                this.toggleBackgroundStyle();
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

        // Update screen shake
        this.updateShake(now);

        // Clear canvas (transparent to show background)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw target
        this.drawTarget();

        // Draw miss flash if active
        this.drawMissFlash(now);

        // Draw impact flash if active
        this.drawImpactFlash(now);

        // Draw dust poof if active (behind particles but after target)
        this.drawDustPoof(now);

        // Draw markers
        this.drawMarkers(now);

        // Draw floating points
        this.drawPoints(now);
        
        // Draw bullseye door and text (if active)
        this.drawBullseyeDoor(now);
        this.drawBullseyeText(now);
    }

    updateShake(now) {
        if (this.shakeStartTime > 0 && now - this.shakeStartTime < this.shakeDuration) {
            const progress = (now - this.shakeStartTime) / this.shakeDuration;
            const easeOut = 1 - Math.pow(1 - progress, 3); // Ease out cubic
            
            // Base shake intensity based on hit distance from center
            // shakeIntensity ranges from 0.2 (edge) to 1.0 (center)
            // Max shake: 4px at center, min shake: 0.5px at edge (barely noticeable)
            // Door slam shake is more intense: 6px max
            const maxShake = this.isDoorSlamShake ? 6 : 4;
            const minShake = 0.5;
            const baseIntensity = minShake + (this.shakeIntensity * (maxShake - minShake));
            
            // Shake intensity decreases over time
            const intensity = (1 - easeOut) * baseIntensity;
            
            // Use time-based noise for smoother, more natural shake
            // This creates a continuous shake pattern instead of random jumps
            const time = (now - this.shakeStartTime) / 16; // Convert to approximate frame time
            
            // Adjust shake frequency based on intensity (harder shake = faster frequency)
            const frequencyMultiplier = 1.0 + (this.shakeIntensity * 0.5); // 1.0 to 1.5
            
            const shakeX = (Math.sin(time * 2.3 * frequencyMultiplier) + Math.cos(time * 1.7 * frequencyMultiplier) * 0.5) * intensity;
            const shakeY = (Math.cos(time * 2.1 * frequencyMultiplier) + Math.sin(time * 1.9 * frequencyMultiplier) * 0.5) * intensity;
            
            // Apply transform to canvas element
            this.canvas.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
            this.canvas.style.transition = 'none'; // Disable smooth transitions for instant shake
        } else if (this.shakeStartTime > 0) {
            // Reset shake
            this.canvas.style.transform = 'translate(0px, 0px)';
            this.canvas.style.transition = 'transform 0.1s ease-out'; // Smooth return
            this.shakeStartTime = 0;
            this.shakeIntensity = 0;
            this.isDoorSlamShake = false;
        }
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
        
        // Apply target transforms
        this.ctx.translate(centerX, centerY);
        this.ctx.rotate((this.targetTransform.rotation * Math.PI) / 180);
        this.ctx.scale(this.targetTransform.scaleX, this.targetTransform.scaleY);
        
        // Apply skew
        const skewXRad = (this.targetTransform.skewX * Math.PI) / 180;
        const skewYRad = (this.targetTransform.skewY * Math.PI) / 180;
        this.ctx.transform(1, Math.tan(skewYRad), Math.tan(skewXRad), 1, 0, 0);
        
        // Apply translation
        this.ctx.translate(
            this.targetTransform.translateX,
            this.targetTransform.translateY
        );
        
        // Translate back to target origin
        this.ctx.translate(-halfSize, -halfSize);

        // Fill target area with gradient (dark slate -> near black)
        // Note: coordinates are now relative to transformed origin
        const bgGradient = this.ctx.createLinearGradient(0, 0, size, size);
        bgGradient.addColorStop(0, '#1a1a1f');
        bgGradient.addColorStop(0.5, '#0f0f12');
        bgGradient.addColorStop(1, '#050508');
        this.ctx.fillStyle = bgGradient;
        this.ctx.fillRect(0, 0, size, size);

        // Draw inner vignette (radial gradient - brighter in center)
        // Center is now at (halfSize, halfSize) relative to transformed origin
        const vignetteGradient = this.ctx.createRadialGradient(halfSize, halfSize, 0, halfSize, halfSize, halfSize);
        vignetteGradient.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
        vignetteGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.01)');
        vignetteGradient.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
        this.ctx.fillStyle = vignetteGradient;
        this.ctx.fillRect(0, 0, size, size);

        // Draw noise texture pattern
        this.ctx.globalAlpha = 0.04;
        this.ctx.fillStyle = this.noisePattern;
        this.ctx.fillRect(0, 0, size, size);
        this.ctx.globalAlpha = 1.0;

        // Draw grid (8x8) - thin, low-contrast lines
        this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.25)';
        this.ctx.lineWidth = 1.25;
        const gridSize = 8;

        for (let i = 1; i < gridSize; i++) {
            // Vertical lines
            const x = i * size / gridSize;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, size);
            this.ctx.stroke();

            // Horizontal lines
            const y = i * size / gridSize;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(size, y);
            this.ctx.stroke();
        }

        // Draw thin inner border line for depth
        this.ctx.strokeStyle = 'rgba(80, 80, 80, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(2, 2, size - 4, size - 4);

        // Draw outer border with violet glow
        this.ctx.strokeStyle = 'rgba(120, 120, 120, 0.6)';
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowColor = this.accentVioletGlow;
        this.ctx.shadowBlur = 8;
        this.ctx.strokeRect(0, 0, size, size);
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';

        // Draw bullseye-style gradient rings (smaller than target square)
        const bullseyeSize = size * 0.85; // 85% of target size
        const bullseyeRadius = bullseyeSize / 2;
        // Center is at (halfSize, halfSize) relative to transformed origin
        const bullseyeGradient = this.ctx.createRadialGradient(
            halfSize, halfSize, 0,
            halfSize, halfSize, bullseyeRadius
        );
        
        // Create exactly 5 rings alternating purple and white
        // Ring 1 (center/bullseye): red (Killer card color)
        bullseyeGradient.addColorStop(0, 'rgba(239, 68, 68, 0.95)');      // Center - red (#EF4444 from Killer card)
        bullseyeGradient.addColorStop(0.19, 'rgba(239, 68, 68, 0.95)');   // End of ring 1
        
        // Ring 2: white
        bullseyeGradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.9)');     // Start of ring 2 - white
        bullseyeGradient.addColorStop(0.39, 'rgba(255, 255, 255, 0.9)');    // End of ring 2
        
        // Ring 3: purple
        bullseyeGradient.addColorStop(0.4, 'rgba(124, 58, 237, 0.85)');  // Start of ring 3 - purple (#7C3AED)
        bullseyeGradient.addColorStop(0.59, 'rgba(124, 58, 237, 0.85)'); // End of ring 3
        
        // Ring 4: white
        bullseyeGradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.8)');      // Start of ring 4 - white
        bullseyeGradient.addColorStop(0.79, 'rgba(255, 255, 255, 0.8)');     // End of ring 4
        
        // Ring 5 (outer): purple
        bullseyeGradient.addColorStop(0.8, 'rgba(124, 58, 237, 0.75)');  // Start of ring 5 - purple (#7C3AED)
        bullseyeGradient.addColorStop(1, 'rgba(124, 58, 237, 0.75)');    // End of ring 5
        
        this.ctx.fillStyle = bullseyeGradient;
        this.ctx.beginPath();
        this.ctx.arc(halfSize, halfSize, bullseyeRadius, 0, 2 * Math.PI);
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
                // Store previous position for motion blur
                particle.prevX = particle.x;
                particle.prevY = particle.y;
                
                // Update particle position (with gravity and deceleration)
                particle.x += particle.vx * deltaTime;
                particle.y += particle.vy * deltaTime;
                particle.rotation += particle.rotationSpeed * deltaTime * 60; // Scale rotation speed
                
                // Apply gravity (only affects Y velocity)
                particle.vy += this.gravity * deltaTime;
                
                // Apply deceleration (air resistance)
                particle.vx *= 0.985;
                particle.vy *= 0.985;
                
                // Update trail length (for optimization - only track if moving fast)
                const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
                particle.trailLength = speed > 30 ? Math.min(particle.trailLength + 1, 3) : 0;
                
                return true; // Keep particle
            }
            return false; // Remove old particle
        });
        
        // Sort particles by z-index for proper layering (back to front)
        this.particlesList.sort((a, b) => a.zIndex - b.zIndex);

        // Draw particles first (behind markers)
        this.particlesList.forEach(particle => {
            const age = now - particle.timestamp;
            const progress = age / this.particleLifetime;
            const alpha = (1 - progress) * (1 - progress); // Fade out

            this.ctx.save();
            
            // Draw motion blur trail (only for fast-moving particles)
            if (particle.trailLength > 0 && progress < 0.7) {
                const trailAlpha = alpha * 0.3 * (1 - progress);
                const dx = particle.x - particle.prevX;
                const dy = particle.y - particle.prevY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0.5) {
                    this.ctx.strokeStyle = `rgba(${particle.r}, ${particle.g}, ${particle.b}, ${trailAlpha})`;
                    this.ctx.lineWidth = particle.size * 0.6;
                    this.ctx.lineCap = 'round';
                    this.ctx.beginPath();
                    this.ctx.moveTo(particle.prevX, particle.prevY);
                    this.ctx.lineTo(particle.x, particle.y);
                    this.ctx.stroke();
                }
            }
            
            this.ctx.translate(particle.x, particle.y);
            this.ctx.rotate(particle.rotation);
            
            // Calculate dimensions based on particle type
            let chipWidth, chipHeight;
            if (particle.type === 'splinter') {
                chipWidth = particle.size * (2.0 + particle.shapeVariation);
                chipHeight = particle.size * particle.aspectRatio;
            } else if (particle.type === 'dust') {
                chipWidth = particle.size * (1.0 + particle.shapeVariation * 0.5);
                chipHeight = particle.size * particle.aspectRatio;
            } else {
                chipWidth = particle.size * (1.5 + particle.shapeVariation);
                chipHeight = particle.size * particle.aspectRatio;
            }
            
            const w = chipWidth / 2;
            const h = chipHeight / 2;
            
            // Draw shadow first (for depth)
            const shadowOffset = 1.5;
            const shadowAlpha = alpha * 0.4;
            this.ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
            this.ctx.beginPath();
            this.drawParticleShape(this.ctx, w, h, particle.type, particle.shapeVariation, shadowOffset, shadowOffset);
            this.ctx.fill();
            
            // Draw main particle with varied gradient (hue shifts throughout)
            const gradient = this.ctx.createLinearGradient(-w, -h, w, h);
            
            // Apply hue variations at different gradient stops for richer color
            const hueVariation1 = particle.hueShift * 0.8; // Slight shift for light area
            const hueVariation2 = particle.hueShift * 1.2; // More shift for mid area
            const hueVariation3 = -particle.hueShift * 0.6; // Opposite shift for dark area
            
            // Light area (top) - lighter with slight hue shift
            const lightR = Math.min(120, Math.max(particle.baseR, particle.baseR + 25 + hueVariation1 * 15));
            const lightG = Math.min(90, Math.max(particle.baseG, particle.baseG + 18 + hueVariation1 * 12));
            const lightB = Math.min(70, Math.max(particle.baseB, particle.baseB + 12 + hueVariation1 * 8));
            
            // Mid area - base color with hue shift
            const midR = Math.min(100, Math.max(30, particle.baseR + hueVariation2 * 12));
            const midG = Math.min(70, Math.max(20, particle.baseG + hueVariation2 * 10));
            const midB = Math.min(60, Math.max(15, particle.baseB + hueVariation2 * 8));
            
            // Dark area (bottom) - darker with opposite hue shift
            const darkR = Math.max(20, Math.min(particle.baseR, particle.baseR - 18 + hueVariation3 * 10));
            const darkG = Math.max(15, Math.min(particle.baseG, particle.baseG - 12 + hueVariation3 * 8));
            const darkB = Math.max(10, Math.min(particle.baseB, particle.baseB - 8 + hueVariation3 * 6));
            
            gradient.addColorStop(0, `rgba(${Math.floor(lightR)}, ${Math.floor(lightG)}, ${Math.floor(lightB)}, ${alpha})`);
            gradient.addColorStop(0.35, `rgba(${Math.floor(lightR * 0.85)}, ${Math.floor(lightG * 0.85)}, ${Math.floor(lightB * 0.85)}, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(${Math.floor(midR)}, ${Math.floor(midG)}, ${Math.floor(midB)}, ${alpha})`);
            gradient.addColorStop(0.65, `rgba(${Math.floor(midR * 0.85)}, ${Math.floor(midG * 0.85)}, ${Math.floor(midB * 0.85)}, ${alpha})`);
            gradient.addColorStop(1, `rgba(${Math.floor(darkR)}, ${Math.floor(darkG)}, ${Math.floor(darkB)}, ${alpha})`);
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.drawParticleShape(this.ctx, w, h, particle.type, particle.shapeVariation, 0, 0);
            this.ctx.fill();
            
            // Add subtle glow (only for larger particles)
            if (particle.size > 4 && progress < 0.6) {
                const glowAlpha = alpha * 0.15 * (1 - progress);
                this.ctx.shadowColor = `rgba(${particle.r}, ${particle.g}, ${particle.b}, ${glowAlpha})`;
                this.ctx.shadowBlur = particle.size * 1.5;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
                this.ctx.shadowColor = 'transparent';
            }
            
            // Add highlight on top edge (warm wood tone instead of pure white)
            const highlightAlpha = alpha * 0.5;
            const highlightGradient = this.ctx.createLinearGradient(-w, -h, -w, h);
            // Use warm amber/light brown for wood highlight
            const highlightR = Math.min(180, lightR + 40);
            const highlightG = Math.min(140, lightG + 30);
            const highlightB = Math.min(100, lightB + 20);
            highlightGradient.addColorStop(0, `rgba(${Math.floor(highlightR)}, ${Math.floor(highlightG)}, ${Math.floor(highlightB)}, ${highlightAlpha * 0.4})`);
            highlightGradient.addColorStop(0.3, `rgba(${Math.floor(highlightR * 0.7)}, ${Math.floor(highlightG * 0.7)}, ${Math.floor(highlightB * 0.7)}, ${highlightAlpha * 0.15})`);
            highlightGradient.addColorStop(1, 'transparent');
            this.ctx.fillStyle = highlightGradient;
            this.ctx.fill();
            
            // Add subtle outline (darker than particle, matching dark oak)
            const outlineR = Math.max(15, darkR - 5);
            const outlineG = Math.max(10, darkG - 5);
            const outlineB = Math.max(5, darkB - 5);
            this.ctx.strokeStyle = `rgba(${Math.floor(outlineR)}, ${Math.floor(outlineG)}, ${Math.floor(outlineB)}, ${alpha * 0.7})`;
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
                    // Draw hit: circle with burst effect (dark for visibility on white/purple)
                    // Use dark purple/black for visibility on both white and purple rings
                    this.ctx.strokeStyle = `rgba(30, 10, 60, ${alpha})`; // Dark purple/black
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

    drawParticleShape(ctx, w, h, type, shapeVariation, offsetX, offsetY) {
        // Draw different shapes based on particle type
        if (type === 'splinter') {
            // Long, thin splinter shape
            const cornerRadius = 0.8;
            ctx.moveTo(offsetX - w + cornerRadius, offsetY - h);
            ctx.lineTo(offsetX + w - cornerRadius, offsetY - h);
            ctx.quadraticCurveTo(offsetX + w, offsetY - h, offsetX + w, offsetY - h + cornerRadius);
            ctx.lineTo(offsetX + w, offsetY + h - cornerRadius);
            ctx.quadraticCurveTo(offsetX + w, offsetY + h, offsetX + w - cornerRadius, offsetY + h);
            ctx.lineTo(offsetX - w + cornerRadius, offsetY + h);
            ctx.quadraticCurveTo(offsetX - w, offsetY + h, offsetX - w, offsetY + h - cornerRadius);
            ctx.lineTo(offsetX - w, offsetY - h + cornerRadius);
            ctx.quadraticCurveTo(offsetX - w, offsetY - h, offsetX - w + cornerRadius, offsetY - h);
            ctx.closePath();
        } else if (type === 'dust') {
            // More square/irregular shape (deterministic based on shapeVariation)
            const cornerRadius = 1.2;
            const irregularity = shapeVariation * 0.2;
            // Use shapeVariation to create deterministic but varied offsets
            const offset1 = (shapeVariation - 0.5) * irregularity;
            const offset2 = (shapeVariation * 0.7 - 0.35) * irregularity;
            const offset3 = (shapeVariation * 1.3 - 0.65) * irregularity;
            const offset4 = (shapeVariation * 0.9 - 0.45) * irregularity;
            
            ctx.moveTo(offsetX - w + cornerRadius + offset1, offsetY - h);
            ctx.lineTo(offsetX + w - cornerRadius, offsetY - h + offset2);
            ctx.quadraticCurveTo(offsetX + w, offsetY - h, offsetX + w, offsetY - h + cornerRadius);
            ctx.lineTo(offsetX + w + offset3, offsetY + h - cornerRadius);
            ctx.quadraticCurveTo(offsetX + w, offsetY + h, offsetX + w - cornerRadius, offsetY + h);
            ctx.lineTo(offsetX - w + cornerRadius, offsetY + h + offset4);
            ctx.quadraticCurveTo(offsetX - w, offsetY + h, offsetX - w, offsetY + h - cornerRadius);
            ctx.lineTo(offsetX - w, offsetY - h + cornerRadius);
            ctx.quadraticCurveTo(offsetX - w, offsetY - h, offsetX - w + cornerRadius, offsetY - h);
            ctx.closePath();
        } else {
            // Standard chip with rounded corners
            const cornerRadius = 1.5;
            ctx.moveTo(offsetX - w + cornerRadius, offsetY - h);
            ctx.lineTo(offsetX + w - cornerRadius, offsetY - h);
            ctx.quadraticCurveTo(offsetX + w, offsetY - h, offsetX + w, offsetY - h + cornerRadius);
            ctx.lineTo(offsetX + w, offsetY + h - cornerRadius);
            ctx.quadraticCurveTo(offsetX + w, offsetY + h, offsetX + w - cornerRadius, offsetY + h);
            ctx.lineTo(offsetX - w + cornerRadius, offsetY + h);
            ctx.quadraticCurveTo(offsetX - w, offsetY + h, offsetX - w, offsetY + h - cornerRadius);
            ctx.lineTo(offsetX - w, offsetY - h + cornerRadius);
            ctx.quadraticCurveTo(offsetX - w, offsetY - h, offsetX - w + cornerRadius, offsetY - h);
            ctx.closePath();
        }
    }

    drawImpactFlash(now) {
        if (this.impactFlash && now - this.impactFlash.timestamp < this.impactFlashDuration) {
            const progress = (now - this.impactFlash.timestamp) / this.impactFlashDuration;
            const alpha = (1 - progress) * (1 - progress); // Quick fade
            
            // Draw radial flash
            const gradient = this.ctx.createRadialGradient(
                this.impactFlash.x, this.impactFlash.y, 0,
                this.impactFlash.x, this.impactFlash.y, 40
            );
            gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.8})`);
            gradient.addColorStop(0.3, `rgba(255, 240, 200, ${alpha * 0.4})`);
            gradient.addColorStop(0.6, `rgba(200, 180, 150, ${alpha * 0.2})`);
            gradient.addColorStop(1, 'transparent');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(this.impactFlash.x, this.impactFlash.y, 40, 0, 2 * Math.PI);
            this.ctx.fill();
        } else if (this.impactFlash) {
            // Clear impact flash after duration
            this.impactFlash = null;
        }
    }

    drawDustPoof(now) {
        if (this.dustPoof && now - this.dustPoof.timestamp < this.dustPoofDuration) {
            const progress = (now - this.dustPoof.timestamp) / this.dustPoofDuration;
            const easeOut = 1 - Math.pow(1 - progress, 3); // Ease out cubic for smooth expansion
            const alpha = (1 - progress) * (1 - progress); // Fade out
            
            // Dust poof expands from 0 to 80 pixels
            const maxRadius = 80;
            const currentRadius = maxRadius * easeOut;
            
            // Create multiple layers for depth (inner, middle, outer)
            this.ctx.save();
            
            // Outer layer - lighter, more spread out
            const outerGradient = this.ctx.createRadialGradient(
                this.dustPoof.x, this.dustPoof.y, currentRadius * 0.3,
                this.dustPoof.x, this.dustPoof.y, currentRadius
            );
            outerGradient.addColorStop(0, `rgba(80, 60, 45, ${alpha * 0.15})`);
            outerGradient.addColorStop(0.5, `rgba(70, 55, 40, ${alpha * 0.12})`);
            outerGradient.addColorStop(1, 'transparent');
            
            this.ctx.fillStyle = outerGradient;
            this.ctx.beginPath();
            this.ctx.arc(this.dustPoof.x, this.dustPoof.y, currentRadius, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Middle layer - medium density
            const middleGradient = this.ctx.createRadialGradient(
                this.dustPoof.x, this.dustPoof.y, currentRadius * 0.15,
                this.dustPoof.x, this.dustPoof.y, currentRadius * 0.7
            );
            middleGradient.addColorStop(0, `rgba(65, 50, 35, ${alpha * 0.25})`);
            middleGradient.addColorStop(0.6, `rgba(60, 45, 32, ${alpha * 0.18})`);
            middleGradient.addColorStop(1, 'transparent');
            
            this.ctx.fillStyle = middleGradient;
            this.ctx.beginPath();
            this.ctx.arc(this.dustPoof.x, this.dustPoof.y, currentRadius * 0.7, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Inner layer - denser, darker
            const innerGradient = this.ctx.createRadialGradient(
                this.dustPoof.x, this.dustPoof.y, 0,
                this.dustPoof.x, this.dustPoof.y, currentRadius * 0.4
            );
            innerGradient.addColorStop(0, `rgba(50, 38, 28, ${alpha * 0.4})`);
            innerGradient.addColorStop(0.4, `rgba(55, 42, 30, ${alpha * 0.3})`);
            innerGradient.addColorStop(1, 'transparent');
            
            this.ctx.fillStyle = innerGradient;
            this.ctx.beginPath();
            this.ctx.arc(this.dustPoof.x, this.dustPoof.y, currentRadius * 0.4, 0, 2 * Math.PI);
            this.ctx.fill();
            
            this.ctx.restore();
        } else if (this.dustPoof) {
            // Clear dust poof after duration
            this.dustPoof = null;
        }
    }

    drawPoints(now) {
        // Clean up old points
        this.pointsList = this.pointsList.filter(point =>
            now - point.timestamp < this.pointsLifetime
        );

        // Draw each points display
        this.pointsList.forEach(point => {
            const age = now - point.timestamp;
            const progress = age / this.pointsLifetime;
            
            // Calculate floating offset (float upward)
            const floatDistance = 60; // Pixels to float upward
            const floatProgress = Math.min(1, age / this.pointsLifetime);
            let currentY = point.startY - (floatProgress * floatDistance);
            
            // Calculate ghostly wiggle (smooth, organic movement)
            const wiggleSpeed = 0.003; // Speed of wiggle oscillation (slower = more ghostly)
            const wiggleAmount = 6; // Maximum wiggle distance in pixels
            const time = age * wiggleSpeed;
            
            // Use multiple overlapping sine waves with smooth interpolation for fluid movement
            // Combine different frequencies for more organic, less mechanical motion
            const wave1X = Math.sin(time * 1.1 + point.wiggleSeedX);
            const wave2X = Math.sin(time * 1.7 + point.wiggleSeedX * 1.3) * 0.6;
            const wave3X = Math.sin(time * 2.3 + point.wiggleSeedX * 0.7) * 0.3;
            
            const wave1Y = Math.cos(time * 1.3 + point.wiggleSeedY);
            const wave2Y = Math.cos(time * 1.9 + point.wiggleSeedY * 1.2) * 0.6;
            const wave3Y = Math.cos(time * 2.1 + point.wiggleSeedY * 0.8) * 0.3;
            
            // Combine waves smoothly (weighted average for smoother motion)
            const combinedX = (wave1X + wave2X + wave3X) / 1.9; // Normalize
            const combinedY = (wave1Y + wave2Y + wave3Y) / 1.9; // Normalize
            
            // Wiggle decreases as it floats up (more stable higher up)
            const wiggleIntensity = 1 - (floatProgress * 0.4); // Reduce wiggle by 40% as it rises
            
            // Apply smooth easing to wiggle for less rigid movement
            const smoothFactor = 0.7; // Smoothing factor (0-1, higher = smoother)
            const wiggleX = combinedX * wiggleAmount * wiggleIntensity;
            const wiggleY = combinedY * wiggleAmount * wiggleIntensity;
            
            // Apply wiggle to position with smooth interpolation
            const currentX = point.x + wiggleX;
            currentY = currentY + wiggleY;
            
            // Calculate scale animation (grow from 0 to 1)
            const scaleDuration = 300; // 300ms to grow to full size
            let scale = 1.0;
            if (age < scaleDuration) {
                const scaleProgress = age / scaleDuration;
                // Ease out cubic for smooth growth
                scale = 1 - Math.pow(1 - scaleProgress, 3);
            }
            
            // Calculate base alpha (fade out after 1 second)
            let baseAlpha = 1.0;
            if (age > this.pointsFadeStart) {
                const fadeProgress = (age - this.pointsFadeStart) / (this.pointsLifetime - this.pointsFadeStart);
                baseAlpha = 1.0 - fadeProgress;
            }
            
            // Add ghostly opacity pulse (breathing effect)
            const pulseSpeed = 0.006; // Speed of opacity pulse
            const pulseAmount = 0.2; // 20% opacity variation (subtle breathing)
            const pulse = Math.sin(age * pulseSpeed + point.opacitySeed) * pulseAmount;
            // Combine base alpha with pulse, ensuring it stays within valid range
            const alpha = Math.max(0, Math.min(1, baseAlpha * (0.8 + pulse))); // Pulse between 0.6 and 1.0 of base alpha
            
            // Save context for transform
            this.ctx.save();
            
            // Apply scale transform
            this.ctx.translate(currentX, currentY);
            this.ctx.scale(scale, scale);
            this.ctx.translate(-currentX, -currentY);
            
            // Set font to Bebas Neue
            this.ctx.font = `bold 72px 'Bebas Neue', sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // Draw text with dark color for visibility on white/purple rings
            const text = `${point.points}`;
            // Use dark purple/black for visibility on both white and purple rings
            this.ctx.fillStyle = `rgba(30, 10, 60, ${alpha})`; // Dark purple/black
            this.ctx.fillText(text, currentX, currentY);
            
            // Restore context
            this.ctx.restore();
        });
    }

    normalizedToPixel(x, y) {
        // Convert normalized coordinates (0.0-1.0) to pixel coordinates within target square
        // Apply the same transforms that are applied to the target
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const size = Math.min(this.canvas.width, this.canvas.height) * this.targetSize;
        const halfSize = size / 2;

        // Start with normalized coordinates in target space (0-1)
        // Convert to target-relative pixel coordinates (relative to target top-left)
        let px = x * size;
        let py = y * size;
        
        // Transform to center of target first
        px -= halfSize;
        py -= halfSize;
        
        // Apply transforms in the same order as drawing:
        // 1. Translate
        px += this.targetTransform.translateX;
        py += this.targetTransform.translateY;
        
        // 2. Rotate
        const rotationRad = (this.targetTransform.rotation * Math.PI) / 180;
        const cos = Math.cos(rotationRad);
        const sin = Math.sin(rotationRad);
        const rotX = px * cos - py * sin;
        const rotY = px * sin + py * cos;
        px = rotX;
        py = rotY;
        
        // 3. Scale
        px *= this.targetTransform.scaleX;
        py *= this.targetTransform.scaleY;
        
        // 4. Skew
        const skewXRad = (this.targetTransform.skewX * Math.PI) / 180;
        const skewYRad = (this.targetTransform.skewY * Math.PI) / 180;
        const skewX = px + py * Math.tan(skewXRad);
        const skewY = py + px * Math.tan(skewYRad);
        px = skewX;
        py = skewY;
        
        // Convert back to canvas coordinates (target is centered)
        return {
            x: centerX + px,
            y: centerY + py
        };
    }

    setBackgroundStyleB() {
        // Set Style B (gradient) as the background
        this.backgroundStyle = 'B';
        const body = document.body;
        body.style.backgroundImage = 'none';
        body.style.background = 'linear-gradient(135deg, #1a1a1f 0%, #0f0f12 50%, #050508 100%)';
        body.style.backgroundColor = ''; // Clear fallback
    }

    toggleBackgroundStyle() {
        // Toggle between Style A (image) and Style B (gradient)
        this.backgroundStyle = this.backgroundStyle === 'A' ? 'B' : 'A';
        
        const body = document.body;
        
        if (this.backgroundStyle === 'A') {
            // Style A: Image background (current/default)
            body.style.backgroundImage = "url('../assets/AxeThrowing_ArtBackground.png')";
            body.style.backgroundSize = 'cover';
            body.style.backgroundPosition = 'center';
            body.style.backgroundRepeat = 'no-repeat';
            body.style.backgroundColor = '#0a0a0a'; // Fallback
            console.log('Background: Style A (Image)');
        } else {
            // Style B: Gradient background (loading screen style)
            body.style.backgroundImage = 'none';
            body.style.background = 'linear-gradient(135deg, #1a1a1f 0%, #0f0f12 50%, #050508 100%)';
            body.style.backgroundColor = ''; // Clear fallback
            console.log('Background: Style B (Gradient)');
        }
    }

    triggerBullseyeEffect(timestamp) {
        // Start the bullseye door animation
        this.bullseyeDoor = {
            timestamp: timestamp,
            state: 'closing', // closing -> closed -> opening
            particlesCreated: false // Track if particles have been created
        };
        
        // Start text display
        this.bullseyeText = {
            timestamp: timestamp
        };
        
        // Trigger additional shake for bullseye (more intense)
        this.shakeIntensity = 1.0; // Maximum intensity
        this.shakeStartTime = timestamp;
    }

    createDoorSlamParticles(timestamp) {
        // Create wood chip particles along the bottom edge of the target with higher speeds
        // Use normalized coordinates: bottom edge is y = 1.0, spread across width (x = 0.0 to 1.0)
        const particleBurstCount = 8; // Number of particle bursts along the bottom
        const bottomY = 1.0; // Bottom edge in normalized coordinates
        
        for (let i = 0; i < particleBurstCount; i++) {
            // Distribute particles across the width, with slight randomness
            const normalizedX = (i / (particleBurstCount - 1)) + (Math.random() - 0.5) * 0.1;
            const normalizedY = bottomY - 0.02; // Slightly above bottom edge
            
            // Clamp to valid range
            const clampedX = Math.max(0.05, Math.min(0.95, normalizedX));
            const clampedY = Math.max(0.9, Math.min(1.0, normalizedY));
            
            // Convert to pixel coordinates
            const pixelCoords = this.normalizedToPixel(clampedX, clampedY);
            const particleCount = 10 + Math.floor(Math.random() * 8); // 10-17 particles per burst

            for (let j = 0; j < particleCount; j++) {
                // Random angle for particle direction (biased downward/outward for door slam)
                const angle = (Math.random() * Math.PI * 0.8) + (Math.PI * 0.1); // Mostly downward angles
                // Higher velocity for door slam particles (faster than regular hit particles)
                const speed = 60 + Math.random() * 80; // 60-140 (vs 25-75 for regular)
                // Random rotation speed
                const rotationSpeed = (Math.random() - 0.5) * 0.2;
                // Random size
                const size = 2 + Math.random() * 6;
                // Random rotation
                const rotation = Math.random() * Math.PI * 2;
                
                // Particle type: 0 = chip, 1 = splinter, 2 = dust
                const typeRoll = Math.random();
                const particleType = typeRoll < 0.5 ? 'chip' : (typeRoll < 0.85 ? 'splinter' : 'dust');
                
                // Z-index for layering (0 = back, 1 = front)
                const zIndex = Math.random() > 0.3 ? 0 : 1;

                // Color palette based on background style
                const colorVariation = Math.random();
                let baseR, baseG, baseB;
                
                if (this.backgroundStyle === 'B') {
                    // Style B: Black and grey palette
                    if (colorVariation < 0.4) {
                        // Dark grey
                        baseR = 30 + Math.random() * 20;  // 30-50
                        baseG = 30 + Math.random() * 20;  // 30-50
                        baseB = 30 + Math.random() * 20;  // 30-50
                    } else if (colorVariation < 0.7) {
                        // Medium grey
                        baseR = 50 + Math.random() * 20;  // 50-70
                        baseG = 50 + Math.random() * 20;  // 50-70
                        baseB = 50 + Math.random() * 20;  // 50-70
                    } else if (colorVariation < 0.9) {
                        // Light grey
                        baseR = 70 + Math.random() * 20;  // 70-90
                        baseG = 70 + Math.random() * 20;  // 70-90
                        baseB = 70 + Math.random() * 20;  // 70-90
                    } else {
                        // Very dark grey/black
                        baseR = 15 + Math.random() * 15;  // 15-30
                        baseG = 15 + Math.random() * 15;  // 15-30
                        baseB = 15 + Math.random() * 15;  // 15-30
                    }
                } else {
                    // Style A: Dark oak color palette - rich dark browns with varied undertones
                    if (colorVariation < 0.4) {
                        // Standard dark oak - rich dark brown
                        baseR = 55 + Math.random() * 20;  // 55-75
                        baseG = 35 + Math.random() * 15;  // 35-50
                        baseB = 25 + Math.random() * 15;  // 25-40
                    } else if (colorVariation < 0.7) {
                        // Reddish dark oak - warmer tones
                        baseR = 65 + Math.random() * 20;  // 65-85
                        baseG = 40 + Math.random() * 15;   // 40-55
                        baseB = 30 + Math.random() * 12;  // 30-42
                    } else if (colorVariation < 0.9) {
                        // Golden dark oak - amber undertones
                        baseR = 60 + Math.random() * 18;  // 60-78
                        baseG = 45 + Math.random() * 15;  // 45-60
                        baseB = 28 + Math.random() * 10;  // 28-38
                    } else {
                        // Cool dark oak - slight grey/purple tones
                        baseR = 50 + Math.random() * 15;  // 50-65
                        baseG = 38 + Math.random() * 12;  // 38-50
                        baseB = 35 + Math.random() * 15;  // 35-50
                    }
                }

                // Hue shift for gradient variation (slight color shifts)
                const hueShift = (Math.random() - 0.5) * 0.15; // -0.15 to 0.15
                const r = Math.max(20, Math.min(100, baseR + hueShift * 20));
                const g = Math.max(15, Math.min(70, baseG + hueShift * 15));
                const b = Math.max(10, Math.min(60, baseB + hueShift * 10));

                // Shape variation parameters
                const shapeVariation = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
                const aspectRatio = particleType === 'splinter' 
                    ? 0.4 + Math.random() * 0.2  // Long and thin
                    : particleType === 'dust'
                    ? 0.8 + Math.random() * 0.2  // More square
                    : 0.5 + Math.random() * 0.3; // Medium

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
                    b: Math.floor(b),
                    baseR: Math.floor(baseR), // Store base color for gradient variation
                    baseG: Math.floor(baseG),
                    baseB: Math.floor(baseB),
                    hueShift: hueShift, // Store hue shift for gradient
                    type: particleType,
                    zIndex: zIndex,
                    shapeVariation: shapeVariation,
                    aspectRatio: aspectRatio,
                    prevX: pixelCoords.x, // For motion blur
                    prevY: pixelCoords.y,
                    trailLength: 0 // Track trail length for optimization
                });
            }
        }
    }

    drawBullseyeDoor(now) {
        if (!this.bullseyeDoor) return;
        
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const size = Math.min(this.canvas.width, this.canvas.height) * this.targetSize;
        const halfSize = size / 2;
        const targetLeft = centerX - halfSize;
        const targetTop = centerY - halfSize;
        const targetBottom = targetTop + size;
        
        const age = now - this.bullseyeDoor.timestamp;
        const doorCloseDuration = 250; // 0.25 seconds to close (faster)
        const doorClosedDuration = 2000; // 2 seconds closed
        const doorOpenDuration = 400; // 0.4 seconds to open
        
        let doorProgress = 0;
        let doorY = targetTop;
        
        if (this.bullseyeDoor.state === 'closing') {
            // Door slides down from top
            const progress = Math.min(1, age / doorCloseDuration);
            // Ease in cubic for slam effect
            doorProgress = progress * progress * progress;
            doorY = targetTop + (size * doorProgress);
            
            // When door reaches bottom, trigger slam shake and change state
            if (progress >= 1) {
                this.bullseyeDoor.state = 'closed';
                this.bullseyeDoor.timestamp = now; // Reset timestamp for closed duration
                // Trigger intense slam shake (more intense than regular hit)
                this.shakeIntensity = 1.0;
                this.isDoorSlamShake = true;
                this.shakeStartTime = now;
                
                // Create wood chip particles along the bottom edge
                if (!this.bullseyeDoor.particlesCreated) {
                    this.createDoorSlamParticles(now);
                    this.bullseyeDoor.particlesCreated = true;
                }
            }
        } else if (this.bullseyeDoor.state === 'closed') {
            // Door stays closed
            doorY = targetBottom;
            doorProgress = 1;
            
            // After 2 seconds, start opening
            if (age >= doorClosedDuration) {
                this.bullseyeDoor.state = 'opening';
                this.bullseyeDoor.timestamp = now; // Reset timestamp for opening duration
            }
        } else if (this.bullseyeDoor.state === 'opening') {
            // Door slides back up
            const progress = Math.min(1, age / doorOpenDuration);
            // Ease out cubic for smooth opening
            doorProgress = 1 - (1 - progress) * (1 - progress) * (1 - progress);
            doorY = targetBottom - (size * doorProgress);
            
            // When fully open, clear the effect
            if (progress >= 1) {
                this.bullseyeDoor = null;
                this.bullseyeText = null;
                return;
            }
        }
        
        // Save context for clipping
        this.ctx.save();
        
        // Clip to target area only (so door appears to come from nothing)
        this.ctx.beginPath();
        this.ctx.rect(targetLeft, targetTop, size, size);
        this.ctx.clip();
        
        // Draw door (solid color with gradients and noise, matching target style)
        // Door fills from top to current position
        const doorHeight = doorY - targetTop;
        
        if (doorHeight > 0) {
            // Fill door with linear gradient (top to bottom, dark slate -> near black)
            const doorGradient = this.ctx.createLinearGradient(
                targetLeft, targetTop,
                targetLeft, targetTop + doorHeight
            );
            doorGradient.addColorStop(0, '#1a1a1f');
            doorGradient.addColorStop(0.5, '#0f0f12');
            doorGradient.addColorStop(1, '#050508');
            this.ctx.fillStyle = doorGradient;
            this.ctx.fillRect(targetLeft, targetTop, size, doorHeight);
            
            // Draw noise texture pattern (matching target)
            this.ctx.globalAlpha = 0.04;
            this.ctx.fillStyle = this.noisePattern;
            this.ctx.fillRect(targetLeft, targetTop, size, doorHeight);
            this.ctx.globalAlpha = 1.0;
        }
        
        // Restore context (removes clipping)
        this.ctx.restore();
    }

    drawBullseyeText(now) {
        if (!this.bullseyeText || !this.bullseyeDoor) return;
        
        // Only show text when door is closed
        if (this.bullseyeDoor.state !== 'closed') return;
        
        // Use door's timestamp (which was reset when door closed) for text timing
        const age = now - this.bullseyeDoor.timestamp;
        const textDuration = 2000; // Show text for 2 seconds (same as door closed duration)
        
        if (age > textDuration) {
            return; // Text will be cleared when door opens
        }
        
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const size = Math.min(this.canvas.width, this.canvas.height) * this.targetSize;
        const halfSize = size / 2;
        const targetLeft = centerX - halfSize;
        const targetTop = centerY - halfSize;
        const targetCenterY = targetTop + size * 0.5; // Exact center of target area
        
        // Calculate text positions (top, middle, bottom)
        // Evenly spaced: 25%, 50%, 75% from top of target
        const topY = targetTop + size * 0.25;
        const middleY = targetCenterY; // Center of target
        const bottomY = targetTop + size * 0.75;
        
        // Flash between colors - instant color changes (dark for visibility on white/purple)
        const flashSpeed = 150; // Milliseconds per color (fast flash)
        const colorIndex = Math.floor(age / flashSpeed) % 3; // Cycle through 0, 1, 2
        const colors = [
            'rgba(30, 10, 60, 1)',  // Dark purple/black for visibility
            this.accentViolet,       // #7C3AED - Violet
            'rgba(50, 20, 100, 1)'   // Dark purple variant
        ];
        const currentColor = colors[colorIndex];
        
        this.ctx.save();
        
        // Clip to target area (same as door)
        this.ctx.beginPath();
        this.ctx.rect(targetLeft, targetTop, size, size);
        this.ctx.clip();
        
        // Draw large "5" behind the text (subtle backdrop) - fills entire door height
        const fontSize = size * 0.9; // 90% of target size to fill height
        this.ctx.font = `bold ${fontSize}px 'Bebas Neue', sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle'; // Use middle baseline for true centering
        
        this.ctx.globalAlpha = 0.15; // Very subtle
        this.ctx.fillStyle = 'rgba(30, 10, 60, 0.15)'; // Dark purple/black backdrop
        // Use targetCenterY - middle baseline centers the text on this point
        this.ctx.fillText('5', centerX, targetCenterY);
        
        // Set font for BULLSEYE text
        this.ctx.font = `bold 120px 'Bebas Neue', sans-serif`;
        this.ctx.globalAlpha = 1; // Full opacity for main text
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Draw text at three heights with solid flashing colors
        const textPositions = [
            { y: topY },
            { y: middleY },
            { y: bottomY }
        ];
        
        textPositions.forEach((pos) => {
            // Draw main text with solid color (no glow, no transparency)
            this.ctx.fillStyle = currentColor;
            this.ctx.fillText('BULLSEYE', centerX, pos.y);
        });
        
        this.ctx.restore();
    }
}

// Timer function - countdown from lock-in expiration
function startTimer() {
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TraxeProjector();
    startTimer();
    
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
