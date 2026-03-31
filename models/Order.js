import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  orderNumber: Number,
  items: [{
    id: { type: String, required: true },
    name: String,
    quantity: Number,
    price: Number,
    specialInstructions: String,
    status: { type: String, default: 'pending', enum: ['pending', 'preparing', 'completed'] },
    completedAt: Date
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'preparing', 'completed', 'cancelled', 'hold'],
    default: 'pending'
  },
  orderType: {
    type: String,
    enum: ['dine-in', 'pickup', 'delivery'],
    default: 'dine-in'
  },
  deliveryPlatform: {
    type: String,
    enum: ['home', 'zomato', 'swiggy'],
    default: null
  },
  deliveryAddress: String,
  tableNumber: String,
  customer: {
    name: String,
    phone: String,
    email: String
  },
  payment: {
    method: String,
    status: String,
    amount: Number,
    transactionId: String,
    timestamp: Date
  },
  timerStart: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
