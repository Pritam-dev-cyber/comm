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
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const PRICING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_USD_TO_INR_RATE = Number(process.env.USD_TO_INR_FALLBACK || '87.44');
const EXCHANGE_RATE_URL = 'https://open.er-api.com/v6/latest/USD';
const EXCHANGE_RATE_TIMEOUT_MS = 5000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BASE_PLANS = Object.freeze({
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
});

let pricingCache = {
    exchangeRate: null,
    expiresAt: 0
};
let mailTransporter;
let razorpayClient;

const Razorpay = require('razorpay');

// Middleware
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});
app.use(express.static(path.join(__dirname, '../public'), {
    etag: true,
    maxAge: '1d'
}));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

function roundCurrency(value) {
    return Math.round(value * 100) / 100;
}

function normalizeString(value, maxLength = 200) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function hasUsableRazorpayConfig() {
    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    return Boolean(
        keyId &&
        keySecret &&
        keyId !== 'rzp_test_your_key_id_here' &&
        keySecret !== 'your_razorpay_key_secret_here'
    );
}

function getRazorpayClient() {
    if (!hasUsableRazorpayConfig()) {
        throw new Error('Razorpay keys are not configured in .env');
    }

    if (!razorpayClient) {
        razorpayClient = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
    }

    return razorpayClient;
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
        const request = https.get(url, (response) => {
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
        });

        request.setTimeout(EXCHANGE_RATE_TIMEOUT_MS, () => {
            request.destroy(new Error('Exchange rate request timed out'));
        });
        request.on('error', reject);
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

function getSelectedPlan(planKey, pricing) {
    return pricing.plans[planKey] || null;
}

function sendSafeError(res, statusCode, message) {
    return res.status(statusCode).json({ error: message });
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
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        razorpayKeyId: hasUsableRazorpayConfig() ? process.env.RAZORPAY_KEY_ID : ''
    });
});

app.post('/api/create-order', async (req, res) => {
    try {
        const razorpay = getRazorpayClient();
        const customerEmail = normalizeString(req.body.customerEmail, 320).toLowerCase();
        const customerName = normalizeString(req.body.customerName, 120);
        const planKey = normalizeString(req.body.planKey, 40);

        if (!EMAIL_REGEX.test(customerEmail)) {
            return sendSafeError(res, 400, 'A valid email is required');
        }

        if (!customerName) {
            return sendSafeError(res, 400, 'Customer name is required');
        }

        const pricing = await getPricingData();
        const selectedPlan = getSelectedPlan(planKey, pricing);

        if (!selectedPlan) {
            return sendSafeError(res, 400, 'Invalid plan selected');
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
        const safeMessage = error.message === 'Razorpay keys are not configured in .env'
            ? error.message
            : 'Failed to create order';
        sendSafeError(res, 500, safeMessage);
    }
});

app.post('/api/verify-payment', async (req, res) => {
    try {
        if (!hasUsableRazorpayConfig()) {
            return sendSafeError(res, 500, 'Razorpay keys are not configured in .env');
        }

        const {
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
            razorpay_signature: razorpaySignature
        } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return sendSafeError(res, 400, 'Missing payment verification data');
        }

        const expectedSignature = Buffer.from(crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex'));
        const receivedSignature = Buffer.from(String(razorpaySignature));

        if (
            expectedSignature.length !== receivedSignature.length ||
            !crypto.timingSafeEqual(expectedSignature, receivedSignature)
        ) {
            return sendSafeError(res, 400, 'Payment verification failed');
        }

        res.json({
            success: true,
            paymentId: razorpayPaymentId
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        sendSafeError(res, 500, 'Payment verification failed');
    }
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
    try {
        const name = normalizeString(req.body.name, 120);
        const email = normalizeString(req.body.email, 320).toLowerCase();
        const phone = normalizeString(req.body.phone, 40);
        const message = normalizeString(req.body.message, 4000);

        if (!name || !message || !EMAIL_REGEX.test(email)) {
            return sendSafeError(res, 400, 'Name, email, and message are required');
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
                <p><strong>Name:</strong> ${escapeHtml(name)}</p>
                <p><strong>Email:</strong> ${escapeHtml(email)}</p>
                <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
                <p><strong>Message:</strong></p>
                <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
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
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Make sure to set your Razorpay and email credentials in the .env file');
});
