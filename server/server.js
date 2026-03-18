const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
require('dotenv').config();
let nodemailer;

try {
    nodemailer = require('nodemailer');
} catch (error) {
    nodemailer = null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const PRICING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_USD_TO_INR_RATE = Number(process.env.USD_TO_INR_FALLBACK || '87.44');
const BASE_PLANS = {
    starter: {
        key: 'starter',
        name: 'Starter Plan',
        oldPriceUsd: 99.00,
        priceUsd: 24.99,
        totalPriceUsd: 299.88,
        period: 'monthly',
        features: '5 phone lines, Unlimited calling (US & Canada)'
    },
    professional: {
        key: 'professional',
        name: 'Professional Plan',
        oldPriceUsd: 199.00,
        priceUsd: 39.99,
        totalPriceUsd: 479.88,
        period: 'monthly',
        features: '25 phone lines, Unlimited calling, Video conferencing'
    },
    enterprise: {
        key: 'enterprise',
        name: 'Enterprise Plan',
        oldPriceUsd: 399.00,
        priceUsd: 99.99,
        totalPriceUsd: 1199.88,
        period: 'monthly',
        features: 'Unlimited phone lines, Worldwide calling, 24/7 support'
    }
};

let pricingCache = {
    exchangeRate: null,
    expiresAt: 0
};
let mailTransporter;

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

function roundCurrency(value) {
    return Math.round(value * 100) / 100;
}

function getMailTransporter() {
    if (mailTransporter) {
        return mailTransporter;
    }

    if (!nodemailer) {
        throw new Error('Email delivery is unavailable because nodemailer is not installed');
    }

    const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD } = process.env;
    if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASSWORD) {
        throw new Error('Email delivery is not configured');
    }

    mailTransporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: Number(EMAIL_PORT),
        secure: Number(EMAIL_PORT) === 465,
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASSWORD
        }
    });

    return mailTransporter;
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Exchange rate request failed with status ${response.statusCode}`));
                response.resume();
                return;
            }

            let rawData = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                rawData += chunk;
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(rawData));
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

async function getUsdToInrRate() {
    if (pricingCache.exchangeRate && pricingCache.expiresAt > Date.now()) {
        return pricingCache.exchangeRate;
    }

    try {
        const data = await fetchJson('https://open.er-api.com/v6/latest/USD');
        const exchangeRate = Number(data?.rates?.INR);

        if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
            throw new Error('Invalid INR exchange rate received');
        }

        pricingCache = {
            exchangeRate,
            expiresAt: Date.now() + PRICING_CACHE_TTL_MS
        };

        return exchangeRate;
    } catch (error) {
        console.error('Falling back to static USD to INR rate:', error.message);

        pricingCache = {
            exchangeRate: FALLBACK_USD_TO_INR_RATE,
            expiresAt: Date.now() + PRICING_CACHE_TTL_MS
        };

        return FALLBACK_USD_TO_INR_RATE;
    }
}

async function getPricingData() {
    const exchangeRate = await getUsdToInrRate();
    const plans = Object.fromEntries(
        Object.entries(BASE_PLANS).map(([key, plan]) => [
            key,
            {
                key: plan.key,
                name: plan.name,
                period: plan.period,
                features: plan.features,
                oldPrice: roundCurrency(plan.oldPriceUsd * exchangeRate),
                price: roundCurrency(plan.priceUsd * exchangeRate),
                totalPrice: roundCurrency(plan.totalPriceUsd * exchangeRate)
            }
        ])
    );

    return {
        currency: 'INR',
        exchangeRate,
        plans
    };
}

app.get('/api/pricing', async (req, res) => {
    try {
        const pricing = await getPricingData();
        res.json(pricing);
    } catch (error) {
        console.error('Pricing API error:', error);
        res.status(500).json({
            error: 'Failed to load pricing'
        });
    }
});

// Create payment intent
app.post('/api/create-payment-intent', async (req, res) => {
    try {
        const { customerEmail, customerName, paymentMethodId, planKey } = req.body;
        const pricing = await getPricingData();
        const selectedPlan = pricing.plans[planKey];

        if (!selectedPlan) {
            return res.status(400).json({
                error: 'Invalid plan selected'
            });
        }

        const amount = Math.round(selectedPlan.totalPrice * 100);
        const planName = selectedPlan.name;

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
            amount: amount, // Amount in paise
            currency: 'inr',
            customer: customer.id,
            payment_method: paymentMethodId,
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

        if (!name || !email || !message) {
            return res.status(400).json({
                error: 'Name, email, and message are required'
            });
        }

        const transporter = getMailTransporter();
        const supportEmail = process.env.SUPPORT_EMAIL || 'support@laxsiy.com';
        const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

        await transporter.sendMail({
            from: fromAddress,
            to: supportEmail,
            replyTo: email,
            subject: `New contact form message from ${name}`,
            text: [
                `Name: ${name}`,
                `Email: ${email}`,
                `Phone: ${phone || 'Not provided'}`,
                '',
                'Message:',
                message
            ].join('\n'),
            html: `
                <h2>New contact form message</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                <p><strong>Message:</strong></p>
                <p>${message.replace(/\n/g, '<br>')}</p>
            `
        });

        res.json({
            success: true,
            message: 'Your message has been sent to support.'
        });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            error: error.message === 'Email delivery is not configured' || error.message === 'Email delivery is unavailable because nodemailer is not installed'
                ? error.message
                : 'Failed to send message'
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
