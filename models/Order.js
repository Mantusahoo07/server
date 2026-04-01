import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: String,
  quantity: Number,
  price: Number,
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
    enum: ['pending', 'accepted', 'preparing', 'ready_for_billing', 'completed', 'cancelled', 'hold'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'razorpay'],
    default: null
  },
  paymentDetails: {
    transactionId: String,
    paymentId: String,
    amount: Number,
    paidAt: Date,
    razorpayOrderId: String,
    razorpayPaymentId: String
  },
  orderType: {
    type: String,
    enum: ['dine-in', 'pickup', 'takeaway', 'delivery'],
    default: 'dine-in'
  },
  deliveryPlatform: {
    type: String,
    enum: ['home', 'zomato', 'swiggy'],
    default: null
  },
  deliveryAddress: String,
  tableNumber: { type: Number, min: 1, max: 20, default: null },
  customer: {
    name: { type: String, default: 'Walk-In' },
    phone: String,
    email: String
  },
  hasModifications: { type: Boolean, default: false },
  isAdditionalOrder: { type: Boolean, default: false },
  parentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  taxRate: { type: Number, default: 0 },
  serviceChargeRate: { type: Number, default: 0 },
  timerStart: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  readyForBillingAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
