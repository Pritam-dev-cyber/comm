let razorpayKeyId = '';
let selectedPlan = {};
let pricingData = {};
const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
});

function updatePriceText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = currencyFormatter.format(value);
    }
}

function updatePriceNote(id, totalPrice, suffix = '') {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = `For 12 months, you pay ${currencyFormatter.format(totalPrice)} today - no price increase.${suffix}`;
    }
}

function showPricing() {
    document.body.classList.remove('pricing-pending');
}

async function loadPricingData() {
    const response = await fetch('/api/pricing');
    if (!response.ok) {
        throw new Error('Failed to load pricing');
    }

    const result = await response.json();
    pricingData = result.plans;

    updatePriceText('heroOldPrice', pricingData.starter.oldPrice);
    updatePriceText('heroNewPrice', pricingData.starter.price);

    updatePriceText('starterOldPrice', pricingData.starter.oldPrice);
    updatePriceText('starterCurrentPrice', pricingData.starter.price);
    updatePriceNote('starterPriceNote', pricingData.starter.totalPrice);

    updatePriceText('professionalOldPrice', pricingData.professional.oldPrice);
    updatePriceText('professionalCurrentPrice', pricingData.professional.price);
    updatePriceNote('professionalPriceNote', pricingData.professional.totalPrice, ' +2 mo free');

    updatePriceText('enterpriseOldPrice', pricingData.enterprise.oldPrice);
    updatePriceText('enterpriseCurrentPrice', pricingData.enterprise.price);
    updatePriceNote('enterprisePriceNote', pricingData.enterprise.totalPrice);
    showPricing();
}

async function loadPaymentConfig() {
    const response = await fetch('/api/payment-config');
    if (!response.ok) {
        throw new Error('Failed to load payment configuration');
    }

    const result = await response.json();
    razorpayKeyId = result.razorpayKeyId || '';
}

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

// Open payment modal
pricingButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        const plan = e.target.dataset.plan;
        selectedPlan = pricingData[plan];

        if (!selectedPlan) {
            alert('Pricing is still loading. Please try again in a moment.');
            return;
        }
        
        // Display selected plan
        document.getElementById('selectedPlan').innerHTML = `
            <h3>${selectedPlan.name}</h3>
            <p class="selected-plan-price">
                ${currencyFormatter.format(selectedPlan.price)} <span class="selected-plan-period">/${selectedPlan.period}</span>
            </p>
            <p>${selectedPlan.features}</p>
            <p class="selected-plan-total">
                Total: ${currencyFormatter.format(selectedPlan.totalPrice)} (12 months)
            </p>
        `;
        
        modal.style.display = 'block';
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
        const cardErrors = document.getElementById('card-errors');
        
        // Disable button and show loading
        submitButton.disabled = true;
        buttonText.textContent = 'Processing...';
        spinner.classList.remove('hidden');
        cardErrors.textContent = '';
        
        try {
            const name = document.getElementById('cardholderName').value;
            const email = document.getElementById('email').value;

            if (!razorpayKeyId) {
                throw new Error('Razorpay is not configured');
            }

            const response = await fetch('/api/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    planKey: selectedPlan.key,
                    customerName: name,
                    customerEmail: email
                }),
            });

            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Failed to create order');
            }

            submitButton.disabled = false;
            buttonText.textContent = 'Continue to Razorpay';
            spinner.classList.add('hidden');

            const razorpayCheckout = new Razorpay({
                key: razorpayKeyId,
                amount: result.amount,
                currency: result.currency,
                name: 'Laxsiy Connect',
                description: `Payment for ${result.planName}`,
                order_id: result.orderId,
                prefill: {
                    name,
                    email
                },
                theme: {
                    color: '#4F46E5'
                },
                handler: async (paymentResult) => {
                    try {
                        const verifyResponse = await fetch('/api/verify-payment', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(paymentResult),
                        });
                        const verifyResult = await verifyResponse.json();

                        if (!verifyResponse.ok || verifyResult.error) {
                            throw new Error(verifyResult.error || 'Payment verification failed');
                        }

                        showSuccessMessage();
                    } catch (verificationError) {
                        cardErrors.textContent = verificationError.message;
                    }
                },
                modal: {
                    ondismiss: () => {
                        buttonText.textContent = 'Continue to Razorpay';
                        spinner.classList.add('hidden');
                        submitButton.disabled = false;
                    }
                }
            });

            razorpayCheckout.open();
        } catch (err) {
            console.error('Payment error:', err);
            cardErrors.textContent = err.message || 'An error occurred. Please try again.';
            submitButton.disabled = false;
            buttonText.textContent = 'Continue to Razorpay';
            spinner.classList.add('hidden');
        }
    });
}

function showSuccessMessage() {
    modal.style.display = 'none';
    alert('Payment successful! Thank you for your purchase. You will receive a confirmation email shortly.');
    
    // Reset form
    document.getElementById('paymentForm').reset();
    document.getElementById('card-errors').textContent = '';
    
    // Re-enable button
    const submitButton = document.getElementById('submitPayment');
    const buttonText = document.getElementById('button-text');
    const spinner = document.getElementById('spinner');
    submitButton.disabled = false;
    buttonText.textContent = 'Continue to Razorpay';
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
            const result = await response.json();
            
            if (response.ok) {
                alert(result.message || 'Thank you for contacting us! We will get back to you shortly.');
                contactForm.reset();
            } else {
                alert(result.error || 'There was an error sending your message. Please try again.');
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

loadPricingData().catch((error) => {
    console.error('Pricing load error:', error);
    showPricing();
});

loadPaymentConfig().catch((error) => {
    console.error('Payment config load error:', error);
});
