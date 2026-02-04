# CommConnect - Business Communications Website

A modern, fully-functional business communications website with integrated payment processing using Stripe.

## Features

- 🎨 **Modern Design**: Clean, professional design inspired by leading hosting/communications providers
- 📱 **Responsive Layout**: Works perfectly on desktop, tablet, and mobile devices
- 💳 **Payment Integration**: Full Stripe payment processing with support for credit cards and 3D Secure
- 🔒 **Secure**: Industry-standard security practices and HTTPS ready
- ⚡ **Fast Performance**: Optimized assets and efficient code
- 📧 **Contact Form**: Functional contact form for customer inquiries
- 🎯 **Modern UI/UX**: Smooth animations, intuitive navigation, and engaging user experience

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Payment Processing**: Stripe API
- **Styling**: Custom CSS with CSS Grid and Flexbox
- **Icons**: Font Awesome

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Stripe account (for payment processing)

### Installation

1. **Clone the repository** (or use this directory):
   ```bash
   cd path/to/pers_wordprs_website
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   - Copy `.env.example` to `.env`:
     ```bash
     copy .env.example .env
     ```
   - Get your Stripe API keys from [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)
   - Update `.env` with your actual Stripe keys:
     ```
     STRIPE_SECRET_KEY=sk_test_your_actual_key_here
     STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key_here
     ```

4. **Update Stripe Publishable Key in frontend**:
   - Open `public/js/main.js`
   - Replace the Stripe publishable key on line 2 with your actual key:
     ```javascript
     const stripe = Stripe('pk_test_your_actual_key_here');
     ```

### Running the Application

#### Development Mode (with auto-restart):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

The website will be available at `http://localhost:3000`

## Project Structure

```
pers_wordprs_website/
├── public/                 # Frontend files
│   ├── css/
│   │   └── style.css      # Main stylesheet
│   ├── js/
│   │   └── main.js        # Frontend JavaScript
│   ├── images/            # Image assets
│   └── index.html         # Main HTML file
├── server/                # Backend files
│   └── server.js          # Express server
├── .env.example           # Environment variables template
├── .gitignore            # Git ignore file
├── package.json          # Dependencies and scripts
└── README.md             # This file
```

## Features Breakdown

### 1. Homepage Hero
- Eye-catching gradient background
- Clear value proposition
- Pricing preview
- Trust indicators (ratings, guarantees)

### 2. Features Section
- 6 key features with icons
- Hover animations
- Responsive grid layout

### 3. Pricing Plans
- Three tier pricing (Starter, Professional, Enterprise)
- Discount badges
- Feature comparison
- Direct payment integration

### 4. Payment Processing
- Stripe integration
- Secure card processing
- 3D Secure support
- Real-time validation
- Success/error handling

### 5. Testimonials
- Customer reviews
- 5-star ratings
- Avatar displays

### 6. Contact Section
- Contact information
- Working contact form
- Multiple contact methods

### 7. Footer
- Company information
- Quick links
- Social media links
- Payment method icons

## Payment Testing

Use Stripe's test card numbers:

- **Successful payment**: `4242 4242 4242 4242`
- **3D Secure required**: `4000 0027 6000 3184`
- **Declined payment**: `4000 0000 0000 0002`

Use any future expiry date, any 3-digit CVC, and any billing ZIP code.

## Customization

### Changing Colors
Edit CSS variables in `public/css/style.css`:
```css
:root {
    --primary-color: #4F46E5;
    --secondary-color: #10B981;
    --dark-color: #1F2937;
    /* ... more colors */
}
```

### Adding New Pages
1. Create HTML file in `public/`
2. Add route in `server/server.js`
3. Link from navigation

### Modifying Pricing Plans
Update the `pricingData` object in `public/js/main.js` and corresponding HTML in `public/index.html`

## Production Deployment

### Before Deploying:

1. **Get production Stripe keys** from Stripe Dashboard
2. **Set up Stripe webhook** for production events
3. **Update environment variables** with production values
4. **Enable HTTPS** (required for Stripe)
5. **Set NODE_ENV to production**:
   ```
   NODE_ENV=production
   ```

### Deployment Options:

- **Heroku**: Easy deployment with automatic HTTPS
- **DigitalOcean**: Full control with droplets
- **AWS EC2**: Scalable cloud hosting
- **Vercel/Netlify**: For static frontend (need separate backend)

## Security Considerations

- ✅ Never commit `.env` file
- ✅ Use environment variables for all secrets
- ✅ Validate all user inputs
- ✅ Use HTTPS in production
- ✅ Keep dependencies updated
- ✅ Implement rate limiting for API endpoints
- ✅ Add CSRF protection for forms

## Future Enhancements

- [ ] User authentication system
- [ ] Customer dashboard
- [ ] Email notifications (welcome, receipts)
- [ ] Database integration (MongoDB/PostgreSQL)
- [ ] Admin panel
- [ ] Blog section
- [ ] Live chat support
- [ ] Multi-language support
- [ ] Analytics integration

## Support

For issues or questions:
- Check Stripe documentation: https://stripe.com/docs
- Review Express.js docs: https://expressjs.com
- Open an issue in the repository

## License

MIT License - feel free to use this project for your own purposes.

## Credits

- Design inspired by MilesWeb
- Content theme inspired by Ooma
- Built with modern web technologies
- Payment processing by Stripe

---

**Note**: This is a demonstration website. Replace all placeholder content, images, and contact information with your actual business details before going live.
