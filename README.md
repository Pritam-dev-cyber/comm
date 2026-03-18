# Laxsiy Connect - Business Communications Website

A business communications website for Laxsiy Connect with INR pricing, Razorpay checkout, contact form email delivery, and structured static content pages.

## Features

- Responsive marketing site with pricing, testimonials, and contact sections
- Server-driven INR pricing with USD to INR conversion and caching
- Razorpay order creation and payment signature verification
- Contact form email delivery to `support@laxsiy.com`
- Structured static pages under `public/pages`

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Payments: Razorpay
- Email: Nodemailer

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env`.
3. Set your Razorpay and email credentials in `.env`:
   ```env
   RAZORPAY_KEY_ID=rzp_test_your_key_id_here
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret_here
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASSWORD=your_email_app_password
   EMAIL_FROM=your_email@gmail.com
   SUPPORT_EMAIL=support@laxsiy.com
   ```
4. Start the app:
   ```bash
   npm run dev
   ```

The site runs at `http://localhost:3000`.

## Project Structure

```text
pers_wordprs_website/
|-- public/
|   |-- css/
|   |   |-- pages.css
|   |   `-- style.css
|   |-- js/
|   |   `-- main.js
|   |-- pages/
|   |   |-- company/
|   |   |-- legal/
|   |   |-- products/
|   |   `-- support/
|   `-- index.html
|-- server/
|   `-- server.js
|-- .env.example
|-- package.json
`-- README.md
```

## Payments

- The frontend requests `/api/create-order` for the selected plan.
- The browser opens Razorpay Checkout using the returned order ID.
- After payment, the frontend posts the Razorpay response to `/api/verify-payment`.
- The server verifies the payment signature before confirming success.

## Pricing

- Base plan prices are defined in `server/server.js` in USD.
- The server converts them to INR using a cached exchange rate.
- The frontend loads pricing from `/api/pricing`.

## Contact Form

- The contact form submits to `/api/contact`.
- The server sends messages to `support@laxsiy.com` using the configured SMTP account.

## Notes

- Review the legal pages and social links before production use.
- Keep `.env` out of version control.
- Use HTTPS in production.
