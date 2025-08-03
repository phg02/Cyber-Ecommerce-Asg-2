# PayPal Integration Setup Guide

## Environment Variables Required

Create a `.env` file in the root directory with the following variables:

```env
# PayPal Configuration
PAYPAL_CLIENT_ID=your_paypal_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_client_secret_here
PAYPAL_API=https://api-m.sandbox.paypal.com

# For production, use: https://api-m.paypal.com

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017/your_database_name

# Session Secret
SESSION_SECRET=your_session_secret_here

# Server Port
PORT=3000
```

## PayPal Setup Steps

1. **Create a PayPal Developer Account**
   - Go to [developer.paypal.com](https://developer.paypal.com)
   - Sign up for a developer account

2. **Create a PayPal App**
   - In the PayPal Developer Dashboard, go to "My Apps & Credentials"
   - Click "Create App"
   - Choose "Business" app type
   - Give it a name (e.g., "My E-commerce Store")

3. **Get Your Credentials**
   - After creating the app, you'll get:
     - Client ID
     - Client Secret
   - Copy these to your `.env` file

4. **Configure Return URLs**
   - In your PayPal app settings, add these return URLs:
     - Success: `http://localhost:3000/paypal/success`
     - Cancel: `http://localhost:3000/paypal/cancel`

## How the Integration Works

1. **User selects PayPal** on the checkout page
2. **billing.js** captures the form data and cart total
3. **Redirects to `/paypal`** with the amount as a query parameter
4. **PayPal router** creates a PayPal order and redirects to PayPal
5. **User completes payment** on PayPal's site
6. **PayPal redirects back** to success/cancel URL
7. **Order completion** happens via the `/paypal/complete-order` endpoint

## Testing

- Use PayPal Sandbox for testing
- Create sandbox buyer and seller accounts in PayPal Developer Dashboard
- Test the complete flow from checkout to payment completion

## Production Deployment

- Change `PAYPAL_API` to `https://api-m.paypal.com`
- Update return URLs to your production domain
- Ensure all environment variables are properly set
- Test thoroughly before going live 