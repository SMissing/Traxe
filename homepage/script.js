// TRAXE Homepage Script

document.addEventListener('DOMContentLoaded', () => {
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

    // Smooth scroll for scroll indicator
    const scrollIndicator = document.querySelector('.scroll-indicator');
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => {
            const techSection = document.querySelector('.tech-section');
            if (techSection) {
                techSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe all cards and features
    const animatedElements = document.querySelectorAll('.tech-card, .goal-item, .capability-feature, .game-mode-card');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Animate stats counting up
    const animateStatValue = (element, finalValue) => {
        const text = element.textContent.trim();
        
        // Extract numeric value and suffix/prefix
        let match = text.match(/([<]?)(\d+\.?\d*)([%+\w]*)/);
        if (!match) return; // Skip if no number found
        
        const prefix = match[1] || '';
        const number = parseFloat(match[2]);
        const suffix = match[3] || '';
        
        const duration = 1500; // 1.5 seconds
        const steps = 60;
        const increment = number / steps;
        let current = 0;
        let step = 0;
        
        const timer = setInterval(() => {
            step++;
            current = Math.min(number, increment * step);
            
            // Format based on original format
            let displayValue;
            if (text.includes('.')) {
                displayValue = current.toFixed(1);
            } else {
                displayValue = Math.floor(current);
            }
            
            element.textContent = prefix + displayValue + suffix;
            
            if (step >= steps) {
                clearInterval(timer);
                element.textContent = text; // Ensure final value is exact
            }
        }, duration / steps);
    };

    // Observe stats section for counting animation
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
                entry.target.classList.add('counted');
                const statItems = entry.target.querySelectorAll('.stat-item');
                statItems.forEach((item, index) => {
                    const valueElement = item.querySelector('.stat-value');
                    if (valueElement) {
                        setTimeout(() => {
                            animateStatValue(valueElement, valueElement.textContent);
                        }, index * 100 + 500); // Stagger by 100ms, start after 500ms
                    }
                });
            }
        });
    }, { threshold: 0.3 });

    const statsPreview = document.querySelector('.stats-preview');
    if (statsPreview) {
        statsObserver.observe(statsPreview);
    }

    // Parallax effect for hero section
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        const hero = document.querySelector('.hero-background');
        if (hero && currentScroll < window.innerHeight) {
            const parallaxSpeed = 0.5;
            hero.style.transform = `translateY(${currentScroll * parallaxSpeed}px)`;
        }
        lastScroll = currentScroll;
    });

    // Add hover effects to CTA buttons
    const ctaButtons = document.querySelectorAll('.cta-button');
    ctaButtons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px) scale(1.05)';
        });
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });

    // Payment Modal
    const purchaseBtn = document.getElementById('purchase-btn');
    const paymentModal = document.getElementById('payment-modal');
    const paymentClose = document.getElementById('payment-close');
    const paymentStep1 = document.getElementById('payment-step-1');
    const paymentStep2 = document.getElementById('payment-step-2');
    const paymentStep3 = document.getElementById('payment-step-3');

    // Open payment modal
    if (purchaseBtn) {
        purchaseBtn.addEventListener('click', () => {
            paymentModal.classList.add('active');
            // Reset to step 1
            paymentStep1.classList.add('active');
            paymentStep2.classList.remove('active');
            paymentStep3.classList.remove('active');
            
            // Start payment flow
            startPaymentFlow();
        });
    }

    // Close payment modal
    if (paymentClose) {
        paymentClose.addEventListener('click', () => {
            closePaymentModal();
        });
    }

    // Close on background click
    if (paymentModal) {
        paymentModal.addEventListener('click', (e) => {
            if (e.target === paymentModal) {
                closePaymentModal();
            }
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && paymentModal.classList.contains('active')) {
            closePaymentModal();
        }
    });

    function closePaymentModal() {
        paymentModal.classList.remove('active');
        // Reset to step 1 for next time
        setTimeout(() => {
            paymentStep1.classList.add('active');
            paymentStep2.classList.remove('active');
            paymentStep3.classList.remove('active');
        }, 300);
    }

    function startPaymentFlow() {
        // Step 1: Collecting bank details (2 seconds)
        setTimeout(() => {
            paymentStep1.classList.remove('active');
            paymentStep2.classList.add('active');
            
            // Step 2: Taking payment (3 seconds)
            setTimeout(() => {
                paymentStep2.classList.remove('active');
                paymentStep3.classList.add('active');
            }, 3000);
        }, 2000);
    }
});

