const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  items: Array,
  total: Number,
  paymentStatus: {
    type: Boolean,
    default: false
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
