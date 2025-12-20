// TRAXE User Game Mode Selection
class GameModeSelector {
    constructor() {
        this.carouselContainer = document.getElementById('carousel-container');
        this.carouselTrack = document.getElementById('carousel-track');
        this.indicatorsContainer = document.getElementById('carousel-indicators');
        
        this.currentIndex = 0;
        this.isDragging = false;
        this.hasDragged = false; // Track if actual drag movement occurred
        this.startX = 0;
        this.currentX = 0;
        this.offsetX = 0;
        this.cardWidth = 400; // Will be updated from CSS
        this.cardGap = 40; // Will be updated from CSS
        this.flippedCardIndex = null; // Track which card is flipped
        
        // WebSocket connection for projector control
        this.ws = null;
        this.connectWebSocket();
        
        this.gameModes = [
            {
                id: 'classic',
                title: 'Classic',
                description: 'Traditional scoring with modern flair. Hit the rings, score points, and compete for the highest total. Perfect for tournaments and casual play.',
                icon: this.createTargetIcon(),
                projectorUrl: '/projector/classic',
                userUrl: '/user/classic',
                colors: {
                    primary: '#7C3AED',
                    secondary: '#A78BFA',
                    gradient: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(167, 139, 250, 0.1) 50%, rgba(79, 70, 229, 0.15) 100%)',
                    border: 'rgba(124, 58, 237, 0.3)',
                    borderHover: 'rgba(124, 58, 237, 0.6)',
                    borderActive: 'rgba(124, 58, 237, 0.8)',
                    buttonGradient: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
                    glow: 'rgba(124, 58, 237, 0.4)'
                }
            },
            {
                id: 'bullseye-blitz',
                title: 'Bullseye Blitz',
                description: 'How many times can you hit the bullseye? Smaller the target, the more points you score.',
                icon: this.createBullseyeBlitzIcon(),
                projectorUrl: '/projector/bullseye-blitz',
                userUrl: '/user/bullseye-blitz',
                colors: {
                    primary: '#FF8C42',
                    secondary: '#FF6B35',
                    gradient: 'linear-gradient(135deg, rgba(255, 140, 66, 0.15) 0%, rgba(255, 107, 53, 0.1) 50%, rgba(255, 165, 0, 0.15) 100%)',
                    border: 'rgba(255, 140, 66, 0.3)',
                    borderHover: 'rgba(255, 140, 66, 0.6)',
                    borderActive: 'rgba(255, 140, 66, 0.8)',
                    buttonGradient: 'linear-gradient(135deg, #FF8C42 0%, #FF6B35 100%)',
                    glow: 'rgba(255, 140, 66, 0.4)'
                }
            },
            {
                id: 'xs-os',
                title: 'Xs & Os',
                description: 'The classic Naughts and Crosses game, but with a modern twist. Steal spaces from your rival to flip the game.',
                icon: this.createXsOsIcon(),
                projectorUrl: '/projector/xs-os',
                userUrl: '/user/xs-os',
                colors: {
                    primary: '#3B82F6',
                    secondary: '#60A5FA',
                    gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.1) 50%, rgba(37, 99, 235, 0.15) 100%)',
                    border: 'rgba(59, 130, 246, 0.3)',
                    borderHover: 'rgba(59, 130, 246, 0.6)',
                    borderActive: 'rgba(59, 130, 246, 0.8)',
                    buttonGradient: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)',
                    glow: 'rgba(59, 130, 246, 0.4)'
                }
            },
            {
                id: 'clay-breaker',
                title: 'Clay Breaker',
                description: 'Clay pigeon target practice. Moving target chaos. How many you can hit.',
                icon: this.createClayBreakerIcon(),
                projectorUrl: '/projector/clay-breaker',
                userUrl: '/user/clay-breaker',
                colors: {
                    primary: '#10B981',
                    secondary: '#34D399',
                    gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(52, 211, 153, 0.1) 50%, rgba(5, 150, 105, 0.15) 100%)',
                    border: 'rgba(16, 185, 129, 0.3)',
                    borderHover: 'rgba(16, 185, 129, 0.6)',
                    borderActive: 'rgba(16, 185, 129, 0.8)',
                    buttonGradient: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
                    glow: 'rgba(16, 185, 129, 0.4)'
                }
            },
            {
                id: 'killer',
                title: 'Killer',
                description: 'Hit your target 3 times to advance to the Killer. Then hit the other target to take out the competition.',
                icon: this.createKillerIcon(),
                projectorUrl: '/projector/killer',
                userUrl: '/user/killer',
                colors: {
                    primary: '#EF4444',
                    secondary: '#F87171',
                    gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(248, 113, 113, 0.1) 50%, rgba(220, 38, 38, 0.15) 100%)',
                    border: 'rgba(239, 68, 68, 0.3)',
                    borderHover: 'rgba(239, 68, 68, 0.6)',
                    borderActive: 'rgba(239, 68, 68, 0.8)',
                    buttonGradient: 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)',
                    glow: 'rgba(239, 68, 68, 0.4)'
                }
            },
            {
                id: '10-pin',
                title: '10 Pin',
                description: '10 Pin Bowling. How many pins can you knock down?',
                icon: this.create10PinIcon(),
                projectorUrl: '/projector/10-pin',
                userUrl: '/user/10-pin',
                colors: {
                    primary: '#F59E0B',
                    secondary: '#FBBF24',
                    gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(251, 191, 36, 0.1) 50%, rgba(217, 119, 6, 0.15) 100%)',
                    border: 'rgba(245, 158, 11, 0.3)',
                    borderHover: 'rgba(245, 158, 11, 0.6)',
                    borderActive: 'rgba(245, 158, 11, 0.8)',
                    buttonGradient: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
                    glow: 'rgba(245, 158, 11, 0.4)'
                }
            }
        ];
        
        this.init();
    }
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8787/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
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
    
    sendProjectorModeChange(gameModeId) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = {
                type: 'setProjectorMode',
                mode: gameModeId
            };
            this.ws.send(JSON.stringify(message));
            console.log('Sent projector mode change:', gameModeId);
        } else {
            console.warn('WebSocket not connected, cannot send projector mode change');
        }
    }
    
    init() {
        this.createCards();
        this.createIndicators();
        this.updateCardPositions();
        this.setupEventListeners();
        this.updateCardWidth();
        
        // Update on resize
        window.addEventListener('resize', () => {
            this.updateCardWidth();
            this.updateCardPositions();
        });
    }
    
    updateCardWidth() {
        // Get card width from CSS variable or computed style
        const card = document.querySelector('.game-card');
        if (card) {
            const computedStyle = window.getComputedStyle(card);
            this.cardWidth = parseFloat(computedStyle.width);
            this.cardGap = parseFloat(computedStyle.gap) || 40;
        }
    }
    
    createTargetIcon() {
        return `<i class="fas fa-bullseye"></i>`;
    }
    
    createBullseyeBlitzIcon() {
        return `<i class="fas fa-crosshairs"></i>`;
    }
    
    createXsOsIcon() {
        return `
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="20" y="20" width="60" height="60" rx="3" stroke="currentColor" stroke-width="3" fill="none"/>
                <line x1="40" y1="20" x2="40" y2="80" stroke="currentColor" stroke-width="2.5"/>
                <line x1="60" y1="20" x2="60" y2="80" stroke="currentColor" stroke-width="2.5"/>
                <line x1="20" y1="40" x2="80" y2="40" stroke="currentColor" stroke-width="2.5"/>
                <line x1="20" y1="60" x2="80" y2="60" stroke="currentColor" stroke-width="2.5"/>
                <path d="M25 25 L35 35 M35 25 L25 35" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                <circle cx="50" cy="50" r="5" stroke="currentColor" stroke-width="3" fill="none"/>
            </svg>
        `;
    }
    
    createClayBreakerIcon() {
        return `<i class="fas fa-dove"></i>`;
    }
    
    createKillerIcon() {
        return `
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 50 50 L 50 10 A 40 40 0 0 1 84.64 25.36 Z" fill="currentColor" stroke="currentColor" stroke-width="3"/>
                <path d="M 50 50 L 84.64 25.36 A 40 40 0 0 1 84.64 74.64 Z" stroke="currentColor" stroke-width="2" fill="none"/>
                <path d="M 50 50 L 84.64 74.64 A 40 40 0 0 1 50 90 Z" stroke="currentColor" stroke-width="2" fill="none"/>
                <path d="M 50 50 L 50 90 A 40 40 0 0 1 15.36 74.64 Z" stroke="currentColor" stroke-width="2" fill="none"/>
                <path d="M 50 50 L 15.36 74.64 A 40 40 0 0 1 15.36 25.36 Z" stroke="currentColor" stroke-width="2" fill="none"/>
                <path d="M 50 50 L 15.36 25.36 A 40 40 0 0 1 50 10 Z" stroke="currentColor" stroke-width="2" fill="none"/>
            </svg>
        `;
    }
    
    create10PinIcon() {
        return `<i class="fas fa-bowling-ball"></i>`;
    }
    
    createCards() {
        this.carouselTrack.innerHTML = '';
        
        this.gameModes.forEach((mode, index) => {
            const card = document.createElement('div');
            card.className = 'game-card';
            card.dataset.index = index;
            card.dataset.mode = mode.id;
            
            // Apply color scheme as CSS custom properties
            const colors = mode.colors;
            card.style.setProperty('--card-primary', colors.primary);
            card.style.setProperty('--card-secondary', colors.secondary);
            card.style.setProperty('--card-gradient', colors.gradient);
            card.style.setProperty('--card-border', colors.border);
            card.style.setProperty('--card-border-hover', colors.borderHover);
            card.style.setProperty('--card-border-active', colors.borderActive);
            card.style.setProperty('--card-button-gradient', colors.buttonGradient);
            card.style.setProperty('--card-glow', colors.glow);
            
            card.innerHTML = `
                <div class="game-card-front">
                    <div class="card-corner-icon card-corner-top-left">${mode.icon}</div>
                    <div class="card-corner-icon card-corner-bottom-right">${mode.icon}</div>
                    <div class="card-icon">${mode.icon}</div>
                    <div class="card-title">${mode.title}</div>
                </div>
                <div class="game-card-back">
                    <div class="card-back-title">${mode.title}</div>
                    <div class="card-back-description">${mode.description}</div>
                    <button class="card-button" data-mode-id="${mode.id}" data-user-url="${mode.userUrl}">Play Now</button>
                    <button class="card-back-button" data-index="${index}">Back</button>
                </div>
            `;
            
            // Add click handler for card front (flip card)
            const cardFront = card.querySelector('.game-card-front');
            
            // Track mouse down position on this card
            let mouseDownX = 0;
            let mouseDownY = 0;
            let cardWasDragged = false;
            
            cardFront.addEventListener('mousedown', (e) => {
                mouseDownX = e.clientX;
                mouseDownY = e.clientY;
                cardWasDragged = false;
            });
            
            cardFront.addEventListener('mousemove', (e) => {
                if (this.isDragging) {
                    const deltaX = Math.abs(e.clientX - mouseDownX);
                    const deltaY = Math.abs(e.clientY - mouseDownY);
                    if (deltaX > 5 || deltaY > 5) {
                        cardWasDragged = true;
                    }
                }
            });
            
            cardFront.addEventListener('click', (e) => {
                // Prevent flip if we dragged or are currently dragging
                if (!this.isDragging && !this.hasDragged && !cardWasDragged) {
                    // If card is not centered, move it to center first
                    if (this.currentIndex !== index) {
                        // If another card is flipped, flip it back first
                        if (this.flippedCardIndex !== null && this.flippedCardIndex !== index) {
                            const cards = this.carouselTrack.querySelectorAll('.game-card');
                            const prevCard = cards[this.flippedCardIndex];
                            if (prevCard) {
                                prevCard.classList.remove('flipped');
                            }
                            this.flippedCardIndex = null;
                        }
                        
                        this.goToIndex(index);
                        // Wait for the card to center before flipping
                        setTimeout(() => {
                            this.flipCard(index);
                        }, 500); // Match the transition duration (0.5s)
        } else {
                        // Card is already centered, flip immediately
                        this.flipCard(index);
                    }
                }
                // Reset after click
                cardWasDragged = false;
            });
            
            // Same for touch events
            cardFront.addEventListener('touchstart', (e) => {
                mouseDownX = e.touches[0].clientX;
                mouseDownY = e.touches[0].clientY;
                cardWasDragged = false;
            });
            
            cardFront.addEventListener('touchmove', (e) => {
                if (this.isDragging) {
                    const deltaX = Math.abs(e.touches[0].clientX - mouseDownX);
                    const deltaY = Math.abs(e.touches[0].clientY - mouseDownY);
                    if (deltaX > 5 || deltaY > 5) {
                        cardWasDragged = true;
                    }
                }
            });
            
            // Add click handler for card back (flip back when clicked)
            const cardBack = card.querySelector('.game-card-back');
            cardBack.addEventListener('click', (e) => {
                // Don't flip if clicking on a button (buttons handle their own clicks)
                if (e.target.classList.contains('card-button') || e.target.classList.contains('card-back-button')) {
                    return;
                }
                // Prevent flip if we dragged
                if (!this.isDragging && !this.hasDragged) {
                    this.flipCard(index);
                }
            });
            
            // Add click handler for Play Now button on back
            const playButton = card.querySelector('.game-card-back .card-button');
            playButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const modeId = playButton.dataset.modeId;
                const userUrl = playButton.dataset.userUrl;
                
                // Send websocket message to change projector mode
                this.sendProjectorModeChange(modeId);
                
                // Navigate to user page
                window.location.href = userUrl;
            });
            
            // Add click handler for Back button
            const backButton = card.querySelector('.card-back-button');
            backButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.flipCard(index);
            });
            
            this.carouselTrack.appendChild(card);
        });
    }
    
    flipCard(index) {
        const cards = this.carouselTrack.querySelectorAll('.game-card');
        const card = cards[index];
        
        if (!card) return;
        
        // If clicking the same card that's already flipped, flip it back
        if (this.flippedCardIndex === index) {
            card.classList.remove('flipped');
            this.flippedCardIndex = null;
                } else {
            // Flip back any previously flipped card
            if (this.flippedCardIndex !== null) {
                const prevCard = cards[this.flippedCardIndex];
                if (prevCard) {
                    prevCard.classList.remove('flipped');
                }
            }
            
            // Flip the clicked card
            card.classList.add('flipped');
            this.flippedCardIndex = index;
        }
    }
    
    createIndicators() {
        this.indicatorsContainer.innerHTML = '';
        
        this.gameModes.forEach((_, index) => {
            const indicator = document.createElement('div');
            indicator.className = 'indicator';
            if (index === this.currentIndex) {
                indicator.classList.add('active');
            }
            
            indicator.addEventListener('click', () => {
                this.goToIndex(index);
            });
            
            this.indicatorsContainer.appendChild(indicator);
        });
    }
    
    setupEventListeners() {
        // Mouse events
        this.carouselContainer.addEventListener('mousedown', this.handleStart.bind(this));
        document.addEventListener('mousemove', this.handleMove.bind(this));
        document.addEventListener('mouseup', this.handleEnd.bind(this));
        
        // Touch events
        this.carouselContainer.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });
        this.carouselContainer.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
        this.carouselContainer.addEventListener('touchend', this.handleEnd.bind(this));
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                this.goToPrevious();
            } else if (e.key === 'ArrowRight') {
                this.goToNext();
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (this.flippedCardIndex === this.currentIndex) {
                    // If card is flipped, navigate
                    const activeCard = this.gameModes[this.currentIndex];
                    if (activeCard) {
                        this.sendProjectorModeChange(activeCard.id);
                        window.location.href = activeCard.userUrl;
                    }
        } else {
                    // Otherwise, flip the card
                    this.flipCard(this.currentIndex);
                }
            } else if (e.key === 'Escape') {
                // Escape to flip back
                if (this.flippedCardIndex !== null) {
                    this.flipCard(this.flippedCardIndex);
                }
            }
        });
    }

    handleStart(e) {
        // Don't start dragging if a card is flipped
        if (this.flippedCardIndex !== null) {
            return;
        }
        
        this.isDragging = true;
        this.hasDragged = false; // Reset drag flag
        this.carouselContainer.classList.add('dragging');
        this.carouselTrack.classList.add('no-transition');
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        this.startX = clientX;
        this.currentX = clientX;
        this.offsetX = this.getCurrentOffset();
        
        // Update focused card at start of drag
        this.updateFocusedCard();
        
        e.preventDefault();
    }
    
    handleMove(e) {
        if (!this.isDragging) return;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        this.currentX = clientX;
        
        const deltaX = this.currentX - this.startX;
        
        // If movement exceeds threshold, mark as dragged
        if (Math.abs(deltaX) > 5) {
            this.hasDragged = true;
        }
        
        const newOffset = this.offsetX + deltaX;
        
        this.updateCarouselPosition(newOffset);
        
        // Update focused card based on which is closest to center
        this.updateFocusedCard();
        
        e.preventDefault();
    }
    
    handleEnd() {
        if (!this.isDragging) return;
        
        const wasDragging = this.hasDragged;
        
        this.isDragging = false;
        this.carouselContainer.classList.remove('dragging');
        this.carouselTrack.classList.remove('no-transition');
        
        // Snap to the currently focused card (closest to center)
        this.updateCardPositions();
        
        // Reset drag flag after a short delay to prevent click events
        setTimeout(() => {
            this.hasDragged = false;
        }, 100);
        
        return wasDragging;
    }
    
    getCurrentOffset() {
        const transform = window.getComputedStyle(this.carouselTrack).transform;
        if (transform === 'none') return 0;
        
        const matrix = transform.match(/matrix\(([^)]+)\)/);
        if (matrix) {
            const values = matrix[1].split(', ');
            return parseFloat(values[4]) || 0;
        }
        return 0;
    }
    
    updateCarouselPosition(offset) {
        this.carouselTrack.style.transform = `translateX(${offset}px)`;
    }
    
    updateCardPositions() {
        const containerWidth = this.carouselContainer.offsetWidth;
        const containerCenterX = containerWidth / 2;
        
        // Get the actual card element
        const cards = this.carouselTrack.querySelectorAll('.game-card');
        const currentCard = cards[this.currentIndex];
        
        if (currentCard) {
            // Get actual card width (may differ slightly from CSS variable)
            const actualCardWidth = currentCard.offsetWidth;
            
            // Calculate the gap between cards (might differ from CSS variable)
            // Get the next card if available, otherwise use CSS gap
            let actualGap = this.cardGap;
            if (this.currentIndex < cards.length - 1) {
                const nextCard = cards[this.currentIndex + 1];
                const currentCardRect = currentCard.getBoundingClientRect();
                const nextCardRect = nextCard.getBoundingClientRect();
                actualGap = nextCardRect.left - currentCardRect.right;
            }
            
            const totalCardWidth = actualCardWidth + actualGap;
            
            // Calculate where the card's center would be in the track (without transform)
            // Card center = (index * spacing) + (card width / 2)
            const cardCenterInTrack = (this.currentIndex * totalCardWidth) + (actualCardWidth / 2);
            
            // Calculate offset to center the card
            // We want: cardCenterInTrack + offset = containerCenterX
            const offset = containerCenterX - cardCenterInTrack;
            
            this.updateCarouselPosition(offset);
        } else {
            // Fallback to original calculation
            const totalCardWidth = this.cardWidth + this.cardGap;
            const cardCenterPosition = (this.currentIndex * totalCardWidth) + (this.cardWidth / 2);
            const offset = containerCenterX - cardCenterPosition;
            this.updateCarouselPosition(offset);
        }
        
        this.updateCardStates();
        this.updateIndicators();
    }
    
    updateFocusedCard() {
        // Find which card is closest to the center of the container
        const containerWidth = this.carouselContainer.offsetWidth;
        const containerCenterX = containerWidth / 2;
        const currentOffset = this.getCurrentOffset();
        const totalCardWidth = this.cardWidth + this.cardGap;
        
        let closestIndex = this.currentIndex;
        let minDistance = Infinity;
        
        this.gameModes.forEach((_, index) => {
            // Calculate card center position
            const cardCenterX = (index * totalCardWidth) + (this.cardWidth / 2) + currentOffset;
            const distance = Math.abs(cardCenterX - containerCenterX);
            
            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });
        
        // Update current index if it changed
        if (closestIndex !== this.currentIndex) {
            this.currentIndex = closestIndex;
            this.updateCardStates();
            this.updateIndicators();
        }
    }
    
    updateCardStates() {
        const cards = this.carouselTrack.querySelectorAll('.game-card');
        cards.forEach((card, index) => {
            card.classList.remove('active', 'inactive');
            
            const distance = Math.abs(index - this.currentIndex);
            if (distance === 0) {
                card.classList.add('active');
            } else if (distance > 1) {
                card.classList.add('inactive');
            }
        });
    }

    updateIndicators() {
        const indicators = this.indicatorsContainer.querySelectorAll('.indicator');
        indicators.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === this.currentIndex);
        });
    }
    
    goToIndex(index) {
        if (index < 0 || index >= this.gameModes.length) return;
        
        // If a card is flipped and we're changing index, flip it back
        if (this.flippedCardIndex !== null && this.flippedCardIndex !== index) {
            const cards = this.carouselTrack.querySelectorAll('.game-card');
            const flippedCard = cards[this.flippedCardIndex];
            if (flippedCard) {
                flippedCard.classList.remove('flipped');
            }
            this.flippedCardIndex = null;
        }
        
        this.currentIndex = index;
        this.updateCardPositions();
    }
    
    goToNext() {
        if (this.currentIndex < this.gameModes.length - 1) {
            this.goToIndex(this.currentIndex + 1);
        } else {
            // Loop back to start
            this.goToIndex(0);
        }
    }
    
    goToPrevious() {
        if (this.currentIndex > 0) {
            this.goToIndex(this.currentIndex - 1);
                    } else {
            // Loop to end
            this.goToIndex(this.gameModes.length - 1);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GameModeSelector();
});


