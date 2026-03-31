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
  serviceCharge: { type: Number, default: 0 },
  total: Number,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'preparing', 'completed', 'cancelled', 'hold'],
    default: 'pending'
  },
  orderType: {
    type: String,
    enum: ['dine-in', 'pickup', 'takeaway', 'delivery'],
    default: 'dine-in'
  },
  deliveryPlatform: {
    type: String,
    enum: ['home', 'zomato', 'swiggy'],
    default: null,
    // Remove the required flag and allow null
    sparse: true
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
  taxRate: { type: Number, default: 0 },
  serviceChargeRate: { type: Number, default: 0 },
  timerStart: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now }
});

// Add a pre-save middleware to remove deliveryPlatform for non-delivery orders
orderSchema.pre('save', function(next) {
  if (this.orderType !== 'delivery') {
    this.deliveryPlatform = undefined;
  }
  next();
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
