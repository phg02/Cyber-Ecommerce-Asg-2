const express = require('express');
const router = express.Router();
const {VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat} = require('vnpay');
const qs = require('qs');
const Order = require('../models/Order');
require('dotenv').config();
router.post('/create-checkout-session', async (req, res) => {
  try {
    var date = new Date();
    const createDate = new Date();
    const orderId = `123456-${createDate.getTime()}`;
    var amount = req.body.amount || 20.00; // Get amount from request body or default to 20.00
    const { billingInfo } = req.body; // Get billing info from request
    
    // Store billing info in session for later use when processing the return
    if (billingInfo) {
      req.session.vnpayBillingInfo = billingInfo;
    }
    
    // Convert USD to VND (assuming 1 USD = 24000 VND for demo purposes)
    // You should use a real currency conversion API in production
    const amountInVND = Math.round(amount * 24000);

    console.log(process.env.VNPAY_TMN_CODE, process.env.VNPAY_HASH_SECRET);
    const vnpay = new VNPay({
        tmnCode: 'G8NK7IRP',
        secureSecret: '1IRAGF0G2MVZHQVS1SW9Z8KC3HIUELXT',
        vnpayHost: 'https://sandbox.vnpayment.vn',
        testMode: true,
        hashAlgorithm: 'SHA512',
        loggerFn: ignoreLogger
    });

    const vnpayResponse = await vnpay.buildPaymentUrl({
        vnp_Amount: amountInVND, // Use the calculated amount in VND
        vnp_IpAddr: '127.0.0.1',
        vnp_TxnRef: orderId,
        vnp_OrderInfo: `Alice Website Payment Order ID: ${orderId} - Amount: $${amount}`,
        vnp_OrderType: ProductCode.Other,
        vnp_Locale: VnpLocale.VN,
        vnp_ReturnUrl: `http://localhost:3000/vnpay/return`,
        vnp_CreateDate: dateFormat(new Date()),
        vnp_ExpireDate: dateFormat(new Date(date.getTime() + 15 * 60 * 1000))
    });
    res.json({ url: vnpayResponse });
  } catch (error) {
    console.error('Error creating payment URL:', error);
    res.status(500).json({error: 'Internal Server Error'});
  }
});

router.get('/return', async (req, res) => {
  const {vnp_ResponseCode, vnp_OrderInfo, vnp_TxnRef, vnp_Amount }=req.query;
  
  if (vnp_ResponseCode === '00') {
    // Payment successful - create and save order
    try {
      // Extract amount from VNPay (convert back from VND to USD)
      const amountInVND = parseInt(vnp_Amount) / 100; // VNPay returns amount in smallest unit
      const amountInUSD = amountInVND / 24000; // Convert back to USD
      
      // Get cart items from session
      const cartItems = req.session.cart || [];
      
      // Get billing info from session (stored during checkout)
      const billingInfo = req.session.vnpayBillingInfo || {};
      
      // Create new order object with billing info from form
      const newOrder = new Order({
        firstName: billingInfo.firstName || 'VNPay Customer',
        lastName: billingInfo.lastName || '',
        email: billingInfo.email || '',
        address: billingInfo.address || '',
        country: billingInfo.country || 'VN',
        city: billingInfo.city || '',
        state: billingInfo.state || '',
        zipCode: billingInfo.zipCode || '',
        items: cartItems,
        total: amountInUSD,
        paymentMethod: 'vnpay',
        paymentId: vnp_TxnRef,
        paymentStatus: true,
        orderStatus: 'confirmed'
      });
      
      // Save order to database
      const savedOrder = await newOrder.save();
      console.log('VNPay order saved successfully:', savedOrder._id);
      
      // Clear cart and billing info after successful payment
      req.session.cart = [];
      req.session.vnpayBillingInfo = null;
      
      // Redirect to success page
      res.redirect(`/checkout?vnpay_status=success&order_id=${savedOrder._id}`);
      
    } catch (error) {
      console.error('Error saving VNPay order:', error);
      res.redirect('/checkout?vnpay_status=error');
    }
  } else {
    // Payment failed or cancelled
    res.redirect(`/checkout?vnpay_status=error&code=${vnp_ResponseCode}`);
  }
});

module.exports = router;