const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Stripe configuration
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Create payment intent
app.post('/api/create-payment-intent', async (req, res) => {
    try {
        const { amount, customerEmail, customerName, planName } = req.body;

        // Create or retrieve customer
        let customer;
        const existingCustomers = await stripe.customers.list({
            email: customerEmail,
            limit: 1
        });

        if (existingCustomers.data.length > 0) {
            customer = existingCustomers.data[0];
        } else {
            customer = await stripe.customers.create({
                email: customerEmail,
                name: customerName,
                metadata: {
                    plan: planName
                }
            });
        }

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount, // Amount in cents
            currency: 'usd',
            customer: customer.id,
            payment_method: req.body.paymentMethodId,
            description: `Payment for ${planName}`,
            metadata: {
                plan: planName,
                customerName: customerName
            },
            confirm: true,
            return_url: `${req.protocol}://${req.get('host')}/payment-success`
        });

        // Check if payment requires additional action
        if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action') {
            res.json({
                requiresAction: true,
                clientSecret: paymentIntent.client_secret
            });
        } else if (paymentIntent.status === 'succeeded') {
            res.json({
                success: true,
                paymentIntentId: paymentIntent.id
            });
        } else {
            res.status(400).json({
                error: 'Payment failed'
            });
        }
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;

        // Here you would typically:
        // 1. Save to database
        // 2. Send email notification
        // 3. Add to CRM system
        
        console.log('Contact form submission:', { name, email, phone, message });

        // For now, just log and return success
        res.json({
            success: true,
            message: 'Thank you for contacting us. We will get back to you shortly.'
        });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            error: 'Failed to submit contact form'
        });
    }
});

// Webhook endpoint for Stripe events
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('PaymentIntent was successful!', paymentIntent.id);
            // Here you would:
            // 1. Update database
            // 2. Send confirmation email
            // 3. Activate service
            break;
        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            console.log('PaymentIntent failed:', failedPayment.id);
            // Handle failed payment
            break;
        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Make sure to set your STRIPE_SECRET_KEY in the .env file`);
});
