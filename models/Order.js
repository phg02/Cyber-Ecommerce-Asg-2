const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  address: String,
  country: String,
  city: String,
  state: String,
  zipCode: String,
  items: Array,
  total: Number,
  paymentMethod: String, // 'paypal', 'stripe', 'googlepay', 'vnpay'
  paymentId: String, // Payment ID from payment provider
  paymentStatus: {
    type: Boolean,
    default: false
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'confirmed'
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
