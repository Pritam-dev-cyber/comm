const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
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

// Razorpay configuration
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

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

app.get('/api/payment-config', (req, res) => {
    res.json({
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || ''
    });
});

app.post('/api/create-order', async (req, res) => {
    try {
        const { customerEmail, customerName, planKey } = req.body;
        const pricing = await getPricingData();
        const selectedPlan = pricing.plans[planKey];

        if (!selectedPlan) {
            return res.status(400).json({
                error: 'Invalid plan selected'
            });
        }

        const amount = Math.round(selectedPlan.totalPrice * 100);
        const planName = selectedPlan.name;
        const order = await razorpay.orders.create({
            amount,
            currency: 'INR',
            receipt: `receipt_${planKey}_${Date.now()}`,
            notes: {
                plan: planName,
                customerName: customerName || '',
                customerEmail: customerEmail || ''
            }
        });

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            planName,
            customerName,
            customerEmail
        });
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

app.post('/api/verify-payment', async (req, res) => {
    try {
        const {
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
            razorpay_signature: razorpaySignature
        } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({
                error: 'Missing payment verification data'
            });
        }

        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({
                error: 'Payment verification failed'
            });
        }

        res.json({
            success: true,
            paymentId: razorpayPaymentId
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            error: 'Payment verification failed'
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
    console.log('Make sure to set your Razorpay and email credentials in the .env file');
});
