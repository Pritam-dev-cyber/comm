// Stripe Configuration
const stripe = Stripe('pk_test_51QaXfDF88k1xdZSjT0dBaKHKPzEPvKL0YkK8hg9v7YcF4M2TnW3vXGgR5zHh3yL2Nm4Vw6tPq8Rt9Uv2Xw3Yz4Aa00123456'); // Replace with your Stripe publishable key
let elements;
let cardElement;
let selectedPlan = {};

// Pricing data
const pricingData = {
    starter: {
        name: 'Starter Plan',
        price: 24.99,
        period: 'monthly',
        totalPrice: 299.88,
        features: '5 phone lines, Unlimited calling (US & Canada)'
    },
    professional: {
        name: 'Professional Plan',
        price: 39.99,
        period: 'monthly',
        totalPrice: 479.88,
        features: '25 phone lines, Unlimited calling, Video conferencing'
    },
    enterprise: {
        name: 'Enterprise Plan',
        price: 99.99,
        period: 'monthly',
        totalPrice: 1199.88,
        features: 'Unlimited phone lines, Worldwide calling, 24/7 support'
    }
};

// Hamburger Menu
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
    });
}

// Smooth Scrolling
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

// Payment Modal
const modal = document.getElementById('paymentModal');
const closeBtn = document.querySelector('.close');
const pricingButtons = document.querySelectorAll('.btn-pricing');

// Initialize Stripe Elements
function initializeStripe() {
    elements = stripe.elements();
    cardElement = elements.create('card', {
        style: {
            base: {
                fontSize: '16px',
                color: '#374151',
                '::placeholder': {
                    color: '#9CA3AF',
                },
            },
        },
    });
    cardElement.mount('#card-element');

    // Handle real-time validation errors
    cardElement.on('change', (event) => {
        const displayError = document.getElementById('card-errors');
        if (event.error) {
            displayError.textContent = event.error.message;
        } else {
            displayError.textContent = '';
        }
    });
}

// Open payment modal
pricingButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        const plan = e.target.dataset.plan;
        selectedPlan = pricingData[plan];
        
        // Display selected plan
        document.getElementById('selectedPlan').innerHTML = `
            <h3>${selectedPlan.name}</h3>
            <p class="price" style="font-size: 2rem; color: var(--primary-color); margin: 1rem 0;">
                $${selectedPlan.price} <span style="font-size: 1rem; color: var(--text-color);">/${selectedPlan.period}</span>
            </p>
            <p>${selectedPlan.features}</p>
            <p style="margin-top: 1rem; font-weight: bold;">
                Total: $${selectedPlan.totalPrice} (12 months)
            </p>
        `;
        
        modal.style.display = 'block';
        
        // Initialize Stripe if not already done
        if (!cardElement) {
            initializeStripe();
        }
    });
});

// Close modal
if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Handle payment form submission
const paymentForm = document.getElementById('paymentForm');
if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitButton = document.getElementById('submitPayment');
        const buttonText = document.getElementById('button-text');
        const spinner = document.getElementById('spinner');
        
        // Disable button and show loading
        submitButton.disabled = true;
        buttonText.textContent = 'Processing...';
        spinner.classList.remove('hidden');
        
        try {
            // Get form data
            const name = document.getElementById('cardholderName').value;
            const email = document.getElementById('email').value;
            
            // Create payment method
            const { error, paymentMethod } = await stripe.createPaymentMethod({
                type: 'card',
                card: cardElement,
                billing_details: {
                    name: name,
                    email: email,
                },
            });
            
            if (error) {
                // Show error
                document.getElementById('card-errors').textContent = error.message;
                submitButton.disabled = false;
                buttonText.textContent = 'Pay Now';
                spinner.classList.add('hidden');
            } else {
                // Send payment method to server
                const response = await fetch('/api/create-payment-intent', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        paymentMethodId: paymentMethod.id,
                        amount: Math.round(selectedPlan.totalPrice * 100), // Convert to cents
                        customerName: name,
                        customerEmail: email,
                        planName: selectedPlan.name
                    }),
                });
                
                const result = await response.json();
                
                if (result.error) {
                    document.getElementById('card-errors').textContent = result.error;
                    submitButton.disabled = false;
                    buttonText.textContent = 'Pay Now';
                    spinner.classList.add('hidden');
                } else if (result.requiresAction) {
                    // Handle 3D Secure authentication
                    const { error: confirmError } = await stripe.confirmCardPayment(
                        result.clientSecret
                    );
                    
                    if (confirmError) {
                        document.getElementById('card-errors').textContent = confirmError.message;
                        submitButton.disabled = false;
                        buttonText.textContent = 'Pay Now';
                        spinner.classList.add('hidden');
                    } else {
                        // Payment successful
                        showSuccessMessage();
                    }
                } else {
                    // Payment successful
                    showSuccessMessage();
                }
            }
        } catch (err) {
            console.error('Payment error:', err);
            document.getElementById('card-errors').textContent = 'An error occurred. Please try again.';
            submitButton.disabled = false;
            buttonText.textContent = 'Pay Now';
            spinner.classList.add('hidden');
        }
    });
}

function showSuccessMessage() {
    modal.style.display = 'none';
    alert('Payment successful! Thank you for your purchase. You will receive a confirmation email shortly.');
    
    // Reset form
    document.getElementById('paymentForm').reset();
    cardElement.clear();
    
    // Re-enable button
    const submitButton = document.getElementById('submitPayment');
    const buttonText = document.getElementById('button-text');
    const spinner = document.getElementById('spinner');
    submitButton.disabled = false;
    buttonText.textContent = 'Pay Now';
    spinner.classList.add('hidden');
}

// Contact Form
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(contactForm);
        const data = {
            name: formData.get('name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            message: formData.get('message')
        };
        
        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                alert('Thank you for contacting us! We will get back to you shortly.');
                contactForm.reset();
            } else {
                alert('There was an error sending your message. Please try again.');
            }
        } catch (error) {
            console.error('Contact form error:', error);
            alert('There was an error sending your message. Please try again.');
        }
    });
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    } else {
        navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    }
});

// Animation on scroll
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

// Observe all cards
document.querySelectorAll('.feature-card, .pricing-card, .testimonial-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(card);
});
