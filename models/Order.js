import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  price: { type: Number, required: true },
  categoryId: { type: String, default: null },
  categoryName: { type: String, default: '' },
  categorySortOrder: { type: Number, default: 0 },
  specialInstructions: String,
  status: { type: String, default: 'pending', enum: ['pending', 'preparing', 'completed', 'cancellation_requested', 'cancelled'] },
  completedAt: Date,
  isModified: { type: Boolean, default: false },
  isRemoved: { type: Boolean, default: false },
  modifiedAt: Date,
  removedAt: Date,
  oldQuantity: Number,
  // New fields for cancellation requests
  cancellationRequested: { type: Boolean, default: false },
  cancellationRequestedAt: Date,
  cancellationRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: { type: String, default: '' },
  cancellationApproved: { type: Boolean, default: false },
  cancellationApprovedAt: Date,
  cancellationApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const orderSchema = new mongoose.Schema({
  baseOrderNumber: { type: Number, required: true },
  runningNumber: { type: Number, default: 0 },
  displayOrderNumber: { type: String, default: '' },
  orderNumber: { type: Number },
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
    enum: [null, 'home', 'zomato', 'swiggy']
  },
  deliveryAddress: {
    type: String,
    default: null
  },
  tableNumber: { type: Number, min: 1, max: 20, default: null },
  tableSessionId: { type: String, default: null },
  isAdditionalOrder: { type: Boolean, default: false },
  isRunningOrder: { type: Boolean, default: false },
  parentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  customer: {
    name: { type: String, default: 'Walk-In' },
    phone: String,
    email: String,
    address: String,
    creditLimit: { type: Number, default: 0 },
    outstandingAmount: { type: Number, default: 0 }
  },
  hasModifications: { type: Boolean, default: false },
  payment: {
    method: {
      type: String,
      enum: [null, 'cash', 'card', 'upi', 'credit', 'pending'],
      default: null
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'credit_due'],
      default: 'pending'
    },
    amount: Number,
    transactionId: String,
    timestamp: Date,
    dueDate: Date,
    customerName: String,
    customerPhone: String
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

// Indexes
orderSchema.index({ tableNumber: 1, status: 1 });
orderSchema.index({ tableSessionId: 1 });
orderSchema.index({ baseOrderNumber: 1 });
orderSchema.index({ displayOrderNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

// Add a pre-save middleware to ensure totals are always correct
orderSchema.pre('save', function(next) {
  // Recalculate totals from items
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    this.tax = this.subtotal * (this.taxRate / 100);
    this.serviceCharge = this.subtotal * (this.serviceChargeRate / 100);
    this.total = this.subtotal + this.tax + this.serviceCharge;
  } else {
    this.subtotal = 0;
    this.tax = 0;
    this.serviceCharge = 0;
    this.total = 0;
  }
  
  if (this.orderType !== 'delivery') {
    this.deliveryPlatform = undefined;
    this.deliveryAddress = undefined;
  }
  
  if (!this.payment || !this.payment.method) {
    this.payment = {
      method: null,
      status: 'pending',
      amount: this.total,
      timestamp: new Date()
    };
  }
  
  // Set displayOrderNumber based on runningNumber
  if (!this.displayOrderNumber) {
    if (this.runningNumber === 0) {
      this.displayOrderNumber = `${this.baseOrderNumber}`;
    } else {
      this.displayOrderNumber = `${this.baseOrderNumber}-${this.runningNumber}`;
    }
  }
  
  // For backward compatibility
  this.orderNumber = this.baseOrderNumber;
  
  // Mark as running order if runningNumber > 0
  this.isRunningOrder = this.runningNumber > 0;
  
  this.updatedAt = new Date();
  next();
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
