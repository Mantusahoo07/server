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
  status: { type: String, enum: ['pending', 'preparing', 'completed', 'cancellation_requested', 'cancelled'], default: 'pending' },
  completedAt: Date,
  isModified: { type: Boolean, default: false },
  isRemoved: { type: Boolean, default: false },
  modifiedAt: Date,
  oldQuantity: Number,
  cancellationRequested: { type: Boolean, default: false },
  cancellationRequestedAt: Date,
  cancellationReason: { type: String, default: '' },
  cancellationApproved: { type: Boolean, default: false },
  cancellationApprovedAt: Date
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
  status: { type: String, enum: ['pending', 'accepted', 'preparing', 'completed', 'cancelled', 'hold', 'ready_for_billing'], default: 'pending' },
  orderType: { type: String, enum: ['dine-in', 'pickup', 'takeaway', 'delivery'], default: 'dine-in' },
  deliveryPlatform: { type: String, enum: [null, 'home', 'zomato', 'swiggy'], default: null },
  deliveryAddress: String,
  tableNumber: { type: Number, default: null },
  tableSessionId: String,
  isAdditionalOrder: { type: Boolean, default: false },
  isRunningOrder: { type: Boolean, default: false },
  customer: {
    name: { type: String, default: 'Walk-In' },
    phone: String,
    email: String
  },
  hasModifications: { type: Boolean, default: false },
  payment: {
    method: { type: String, enum: [null, 'cash', 'card', 'upi', 'credit', 'pending'], default: null },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded', 'credit_due'], default: 'pending' },
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
  completedAt: Date,
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

orderSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    this.tax = this.subtotal * (this.taxRate / 100);
    this.serviceCharge = this.subtotal * (this.serviceChargeRate / 100);
    this.total = this.subtotal + this.tax + this.serviceCharge;
  }
  
  if (this.runningNumber === 0) {
    this.displayOrderNumber = `${this.baseOrderNumber}`;
  } else {
    this.displayOrderNumber = `${this.baseOrderNumber}-${this.runningNumber}`;
  }
  
  this.orderNumber = this.baseOrderNumber;
  this.isRunningOrder = this.runningNumber > 0;
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('Order', orderSchema);