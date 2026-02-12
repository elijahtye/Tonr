// Demo interaction
document.addEventListener('DOMContentLoaded', function() {
    const demoBox = document.querySelector('.demo-box');
    const rawInput = document.getElementById('rawInput');
    const refinedOutput = document.getElementById('refinedOutput');
    const useButton = document.querySelector('.btn-demo');

    // Example transformations for speechmaxxing - voice note transcript style
    const examples = [
        {
            raw: "Um ( pause ) I-I was thinking ( pause ) Maybe we could hang out again? ( lower voice )",
            neutral: "I enjoyed spending time with you. Let's do it again.",
            assertive: "I want to see you again. When are you free?",
            composed: "I enjoyed our time together. I'd like to do it again."
        },
        {
            raw: "Uh, so I-I guess ( pause ) I kind of like that idea? ( uncertain tone ) But I'm not really sure if it would work ( trailing off )",
            neutral: "That's interesting. Here's how we can make it work.",
            assertive: "I see potential. Here's how we'll make it work.",
            composed: "That's an interesting approach. Let me outline how we can implement it."
        },
        {
            raw: "Sorry to bother you ( pause ) but do you think you might be able to help me with this? ( hesitant )",
            neutral: "I need your expertise on this. When can we discuss it?",
            assertive: "I need your help with this. When can we talk?",
            composed: "I'd appreciate your input on this. When would be a good time to discuss?"
        },
        {
            raw: "So, um ( pause ) I was wondering if maybe ( pause ) we could talk about this later? ( questioning tone )",
            neutral: "Let's discuss this when you're ready.",
            assertive: "We need to discuss this. When works for you?",
            composed: "I'd like to discuss this further. When would be convenient for you?"
        }
    ];

    let currentExample = 0;
    const toneSelect = document.getElementById('toneSelect');

    // Get current tone
    function getCurrentTone() {
        return toneSelect.value;
    }

    // Get refined text based on current tone
    function getRefinedText(example) {
        const tone = getCurrentTone();
        return example[tone] || example.neutral;
    }

    // Animate text with smooth sliding transition
    function animateText(container, newText) {
        const contentSpan = container.querySelector('.demo-text-content');
        if (!contentSpan) return;

        // Create new span for incoming text
        const newSpan = document.createElement('span');
        newSpan.className = 'demo-text-content slide-in';
        newSpan.textContent = newText;
        
        // Add new span to container
        container.appendChild(newSpan);
        
        // Trigger reflow to ensure initial state is applied
        newSpan.offsetHeight;
        
        // Start animations
        contentSpan.classList.add('slide-out');
        newSpan.classList.add('active');
        
        // Remove old span after animation completes
        setTimeout(() => {
            contentSpan.remove();
            newSpan.classList.remove('slide-in');
        }, 500);
    }

    // Update output based on current tone
    function updateOutput() {
        const example = examples[currentExample];
        const refinedText = getRefinedText(example);
        animateText(refinedOutput, refinedText);
    }

    // Cycle through examples
    function updateExample() {
        currentExample = (currentExample + 1) % examples.length;
        const example = examples[currentExample];
        animateText(rawInput, example.raw);
        updateOutput();
    }

    // Auto-cycle every minute (60000ms)
    setInterval(updateExample, 60000);

    // Button click handler
    useButton.addEventListener('click', function() {
        updateExample();
    });

    // Tone selector change handler
    toneSelect.addEventListener('change', function() {
        updateOutput();
    });

    // Initialize with current tone
    updateOutput();

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // CTA button handlers
    document.querySelectorAll('.btn-primary').forEach(button => {
        button.addEventListener('click', function() {
            // In a real app, this would navigate to signup/login
            console.log('CTA clicked - would navigate to signup');
        });
    });

    // Add subtle parallax effect on scroll
    let lastScroll = 0;
    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;
        const demoBox = document.querySelector('.demo-box');
        
        if (demoBox && currentScroll < window.innerHeight) {
            const parallax = currentScroll * 0.1;
            demoBox.style.transform = `translateY(${parallax}px)`;
        }
        
        lastScroll = currentScroll;
    });

    // Feature card click handlers - ensure only one card opens at a time
    const featureCards = document.querySelectorAll('.feature-card');
    let currentlyActiveCard = null;
    
    featureCards.forEach(card => {
        // Only respond to clicks directly on the card, not children
        card.addEventListener('click', function(e) {
            // Stop event from bubbling up
            e.stopPropagation();
            
            // Get the clicked card
            const clickedCard = e.currentTarget;
            
            // Check if this card is already active
            const isCurrentlyActive = clickedCard === currentlyActiveCard;
            
            // Close the currently active card if it exists and is different
            if (currentlyActiveCard && currentlyActiveCard !== clickedCard) {
                currentlyActiveCard.classList.remove('active');
            }
            
            // Toggle the clicked card
            if (isCurrentlyActive) {
                // If clicking the same card, close it
                clickedCard.classList.remove('active');
                currentlyActiveCard = null;
            } else {
                // Open the clicked card
                clickedCard.classList.add('active');
                currentlyActiveCard = clickedCard;
            }
        });
        
        // Prevent clicks on the info section from bubbling
        const infoSection = card.querySelector('.feature-info');
        if (infoSection) {
            infoSection.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }
    });
});

