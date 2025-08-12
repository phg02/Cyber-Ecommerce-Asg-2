const express = require('express');
const app = express();
require('dotenv').config();
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'assets')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

const Product = require('./models/Product');
const Order = require('./models/Order');

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Sample route
app.get('/', (req, res) => {
    Product.find()
    .then(products => {
        res.render('index', { products });
    })
    .catch(err => {
        console.error('Error fetching products:', err);
        res.status(500).send('Internal Server Error');
    });
});

app.get('/add-to-cart', async (req, res) => {
  const { productId } = req.query;
  const product = await Product.findById(productId);

  if (!req.session.cart) req.session.cart = [];
  req.session.cart.push(product);
  res.redirect('/');
});

app.get('/chart', (req, res) => {
  res.render('chart', { cart: req.session.cart || [] });
});

// Update quantity of cart items
app.post('/cart/update', (req, res) => {
    const { updates } = req.body;
    if (!req.session.cart) return res.json({ success: false });

    updates.forEach(update => {
        if (req.session.cart[update.index]) {
            req.session.cart[update.index].quantity = update.quantity;
        }
    });

    res.json({ success: true });
});

// Remove selected items from cart
app.post('/cart/remove', (req, res) => {
    const { indexes } = req.body;
    if (!req.session.cart) return res.json({ success: false });

    // Remove by filtering out items at those indexes
    req.session.cart = req.session.cart.filter((_, i) => !indexes.includes(i));
    res.json({ success: true });
})


app.get('/checkout', (req, res) => {
    // Allow access if there are payment status parameters (success/cancel/error)
    const hasPaymentStatus = req.query.paypal_status || req.query.stripe_status || req.query.vnpay_status;
    
    if (!hasPaymentStatus && (!req.session.cart || req.session.cart.length === 0)) {
        return res.redirect('/');
    }

    // For payment status callbacks, use empty cart and zero total
    const cart = req.session.cart || [];
    const total = cart.length > 0 ? cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0) : 0;
    res.render('paymentPage', { cart: cart, total: total });
});

// Generic order creation endpoint for frontend payment methods (Google Pay, etc.)
app.post('/create-order', async (req, res) => {
    try {
        const { billingInfo, paymentData, paymentMethod, total } = req.body;
        
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
            total: total || 0,
            paymentMethod: paymentMethod,
            paymentId: paymentData.orderId || paymentData.id || `${paymentMethod.toUpperCase()}-${Date.now()}`,
            paymentStatus: true,
            orderStatus: 'confirmed'
        });
        
        // Save order to database
        const savedOrder = await newOrder.save();
        
        // Clear cart after successful order creation
        req.session.cart = [];
        
        console.log(`${paymentMethod} order saved successfully:`, savedOrder._id);
        
        res.json({ 
            success: true, 
            orderId: savedOrder._id,
            message: 'Order created successfully'
        });
        
    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create order' 
        });
    }
});

app.use("/paypal", require('./router/paypalRouter'));
app.use("/stripe", require('./router/stripeRouter'));
app.use("/vnpay", require('./router/vnPayRouter'));
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});