import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  price: { type: Number, required: true },
  specialInstructions: String,
  status: { type: String, default: 'pending', enum: ['pending', 'preparing', 'completed'] },
  completedAt: Date,
  isModified: { type: Boolean, default: false },
  isRemoved: { type: Boolean, default: false },
  modifiedAt: Date,
  removedAt: Date,
  oldQuantity: Number
});

const orderSchema = new mongoose.Schema({
  orderNumber: Number,
  items: [orderItemSchema],
  subtotal: Number,
  tax: Number,
  serviceCharge: { type: Number, default: 0 },
  total: Number,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'preparing', 'completed', 'cancelled', 'hold', 'ready_for_billing'],
    default: 'pending'
  },
  orderType: {
    type: String,
    enum: ['dine-in', 'pickup', 'takeaway', 'delivery'],
    default: 'dine-in'
  },
  deliveryPlatform: {
    type: String,
    default: null,
    enum: [null, 'home', 'zomato', 'swiggy']  // Allow null for non-delivery orders
  },
  deliveryAddress: {
    type: String,
    default: null
  },
  tableNumber: { type: Number, min: 1, max: 20, default: null },
  customer: {
    name: { type: String, default: 'Walk-In' },
    phone: String,
    email: String
  },
  hasModifications: { type: Boolean, default: false },
  isAdditionalOrder: { type: Boolean, default: false },
  parentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  payment: {
    method: {
      type: String,
      enum: [null, 'cash', 'card', 'upi', 'credit', 'pending'],
      default: null
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    amount: Number,
    transactionId: String,
    timestamp: Date
  },
  taxRate: { type: Number, default: 0 },
  serviceChargeRate: { type: Number, default: 0 },
  timerStart: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

// Pre-save middleware to clean up fields
orderSchema.pre('save', function(next) {
  // Set deliveryPlatform to null for non-delivery orders
  if (this.orderType !== 'delivery') {
    this.deliveryPlatform = undefined;
    this.deliveryAddress = undefined;
  }
  
  // Set payment method to null for pending orders
  if (!this.payment || !this.payment.method) {
    this.payment = {
      method: null,
      status: 'pending',
      amount: this.total,
      timestamp: new Date()
    };
  }
  
  this.updatedAt = new Date();
  next();
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
