const express = require('express');
const axios = require('axios');
const https = require('https');
const Order = require('../models/Order');
const router = express.Router();

const CLIENT = process.env.PAYPAL_CLIENT_ID;
const SECRET = process.env.PAYPAL_CLIENT_SECRET;
// Use sandbox by default, can be overridden with environment variable
const PAYPAL_API = process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com';


// Function to get PayPal access token
async function generateAccessToken() {
  // Validate required environment variables
  if (!CLIENT || !SECRET) {
    throw new Error('PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables.');
  }

  if (!PAYPAL_API) {
    throw new Error('PayPal API URL not configured. Please set PAYPAL_API environment variable.');
  }

  try {
    const response = await axios({
      url: `${PAYPAL_API}/v1/oauth2/token`,
      method: 'post',
      auth: {
        username: CLIENT,
        password: SECRET
      },
      params: {
        grant_type: 'client_credentials'
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 30000, // 30 second timeout
      httpsAgent: new https.Agent({
        keepAlive: true,
        timeout: 30000
      })
    });

    return response.data.access_token;
  } catch (error) {
    console.error('PayPal OAuth Error:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      throw new Error('Invalid PayPal credentials. Please check your CLIENT_ID and CLIENT_SECRET.');
    } else if (error.code === 'ENOTFOUND') {
      throw new Error(`Cannot connect to PayPal API at ${PAYPAL_API}. Please check your internet connection and API URL.`);
    } else {
      throw new Error(`PayPal authentication failed: ${error.message}`);
    }
  }
}

// Create PayPal order
router.get('/', async (req, res) => {
  console.log('PayPal order creation started');
  console.log('Amount from query:', req.query.amount);
  console.log('PayPal API URL:', PAYPAL_API);
  
  try {
    const accessToken = await generateAccessToken();
    console.log('Access token generated successfully');
    
    const amount = req.query.amount;
    
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).send('Invalid amount provided');
    }

    console.log('Creating PayPal order with amount:', amount);
    
    const order = await axios.post(`${PAYPAL_API}/v2/checkout/orders`, {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: amount
        },
        description: 'Online Store Purchase'
      }],
      application_context: {
        return_url: `${req.protocol}://${req.get('host')}/paypal/success`,
        cancel_url: `${req.protocol}://${req.get('host')}/paypal/cancel`
      }
    }, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000, // 30 second timeout
      httpsAgent: new https.Agent({
        keepAlive: true,
        timeout: 30000
      })
    });

    console.log('PayPal order created successfully');
    const approveUrl = order.data.links.find(link => link.rel === 'approve').href;
    console.log('Redirecting to PayPal approval URL:', approveUrl);
    res.redirect(approveUrl);

  } catch (error) {
    console.error('PayPal Create Order Error:', error.response?.data || error.message);
    console.error('Full error object:', error);
    
    // Provide specific error messages based on error type
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      res.status(500).send('Network timeout. Please check your internet connection and try again.');
    } else if (error.code === 'ENOTFOUND') {
      res.status(500).send('Cannot connect to PayPal. Please check your internet connection.');
    } else if (error.response?.status === 401) {
      res.status(500).send('PayPal authentication failed. Please check your credentials.');
    } else {
      res.status(500).send('Error creating PayPal order. Please try again later.');
    }
  }
});

// Handle success
router.get('/success', async (req, res) => {
  const { token } = req.query;

  try {
    const accessToken = await generateAccessToken();

    const capture = await axios.post(`${PAYPAL_API}/v2/checkout/orders/${token}/capture`, {}, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000, // 30 second timeout
      httpsAgent: new https.Agent({
        keepAlive: true,
        timeout: 30000
      })
    });

    // Redirect to a success page with payment data
    const paymentData = encodeURIComponent(JSON.stringify(capture.data));
    res.redirect(`/checkout?paypal_status=success&payment_data=${paymentData}`);
    
  } catch (error) {
    console.error('Capture Error:', error.response?.data || error.message);
    res.redirect('/checkout?paypal_status=error');
  }
});

// Handle cancel
router.get('/cancel', (req, res) => {
  res.redirect('/checkout?paypal_status=cancel');
});

// API endpoint to complete order (called from frontend)
router.post('/complete-order', async (req, res) => {
  try {
    const { paymentData, billingInfo, paymentMethod } = req.body;
    
    // Create new order object
    const newOrder = new Order({
      firstName: billingInfo.firstName || billingInfo.firstname || '',
      lastName: billingInfo.lastName || billingInfo.lastname || '',
      email: billingInfo.email || '',
      address: billingInfo.address || '',
      country: billingInfo.country || '',
      city: billingInfo.city || '',
      state: billingInfo.state || '',
      zipCode: billingInfo.zipCode || billingInfo.zipcode || '',
      items: req.session.cart || [],
      total: paymentData.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || 0,
      paymentMethod: paymentMethod,
      paymentId: paymentData.id || paymentData.purchase_units?.[0]?.payments?.captures?.[0]?.id,
      paymentStatus: true,
      orderStatus: 'confirmed'
    });
    
    // Save order to database
    const savedOrder = await newOrder.save();
    
    // Clear the cart after successful order creation
    req.session.cart = [];
    
    console.log('Order saved successfully:', savedOrder._id);
    
    res.json({ 
      success: true, 
      orderId: savedOrder._id,
      message: 'Order completed successfully'
    });
    
  } catch (error) {
    console.error('Order completion error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to complete order' 
    });
  }
});

module.exports = router;