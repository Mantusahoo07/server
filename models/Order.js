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
  serviceCharge: Number,
  total: Number,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'preparing', 'completed', 'cancelled', 'hold'],
    default: 'pending'
  },
  orderType: {
    type: String,
    enum: ['dine-in', 'pickup', 'takeaway', 'delivery'],  // 'takeaway' is now a valid option
    default: 'dine-in'
  },
  deliveryPlatform: {
    type: String,
    enum: ['home', 'zomato', 'swiggy'],
    default: null,
    required: false
  },
  deliveryAddress: {
    type: String,
    default: null
  },
  tableNumber: {
    type: Number,
    min: 1,
    max: 20,
    default: null
  },
  customer: {
    name: { type: String, default: 'Walk-In' },
    phone: String,
    email: String
  },
  isAdditionalOrder: { type: Boolean, default: false },
  parentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  payment: {
    method: String,
    status: String,
    amount: Number,
    transactionId: String,
    timestamp: Date
  },
  timerStart: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
