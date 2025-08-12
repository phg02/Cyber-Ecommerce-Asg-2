const express = require("express");
const router = express.Router();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/Order');

router.post("/create-checkout-session", async (req, res) => {
  try {
    const cartItems = req.session.cart;
    const { billingInfo } = req.body; // Get billing info from request
    
    if (!req.session.cart || !Array.isArray(req.session.cart)) {
      return res.status(400).json({ error: "Cart is empty or undefined." });
    }
    
    // Store billing info in session for later use
    if (billingInfo) {
      req.session.billingInfo = billingInfo;
    }
    
    const lineItems = cartItems.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name || 'Product',
          images: item.image ? [item.image] : [], // Only include if image exists
        },
        unit_amount: Math.round(item.price * 100), // Stripe expects amount in cents
      },
      quantity: item.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${req.protocol}://${req.get('host')}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/stripe/cancel`,
    });
    
    res.json({ id: session.id, url: session.url });
    
  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Handle Stripe success
router.get("/success", async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (session_id) {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      
      if (session.payment_status === 'paid') {
        // Get billing info from session or use customer details from Stripe
        const billingInfo = req.session.billingInfo || {};
        const cartItems = req.session.cart || [];
        const total = cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
        
        // Create new order object
        const newOrder = new Order({
          firstName: billingInfo.firstName || billingInfo.firstname || session.customer_details?.name?.split(' ')[0] || 'Customer',
          lastName: billingInfo.lastName || billingInfo.lastname || session.customer_details?.name?.split(' ').slice(1).join(' ') || '',
          email: billingInfo.email || session.customer_details?.email || '',
          address: billingInfo.address || session.customer_details?.address?.line1 || '',
          country: billingInfo.country || session.customer_details?.address?.country || '',
          city: billingInfo.city || session.customer_details?.address?.city || '',
          state: billingInfo.state || session.customer_details?.address?.state || '',
          zipCode: billingInfo.zipCode || billingInfo.zipcode || session.customer_details?.address?.postal_code || '',
          items: cartItems,
          total: total,
          paymentMethod: 'stripe',
          paymentId: session.payment_intent,
          paymentStatus: true,
          orderStatus: 'confirmed'
        });
        
        // Save order to database
        const savedOrder = await newOrder.save();
        console.log('Stripe order saved successfully:', savedOrder._id);
        
        // Clear cart and billing info after successful payment
        req.session.cart = [];
        req.session.billingInfo = null;
        res.redirect('/checkout?stripe_status=success&order_id=' + savedOrder._id);
      } else {
        res.redirect('/checkout?stripe_status=error');
      }
    } else {
      res.redirect('/checkout?stripe_status=error');
    }
    
  } catch (error) {
    console.error('Stripe success handler error:', error);
    res.redirect('/checkout?stripe_status=error');
  }
});

// Handle Stripe cancel
router.get("/cancel", (req, res) => {
  res.redirect('/checkout?stripe_status=cancel');
});

module.exports = router;

