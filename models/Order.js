const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  modifiers: [{
    id: String,
    name: String,
    price: Number
  }],
  specialInstructions: String,
  course: {
    type: String,
    enum: ['appetizer', 'main', 'dessert', 'beverage', 'side'],
    default: 'main'
  },
  station: String,
  status: {
    type: String,
    enum: ['pending', 'preparing', 'ready', 'served', 'cancelled'],
    default: 'pending'
  },
  preparedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  startedAt: Date,
  completedAt: Date
});

const paymentSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ['cash', 'card', 'upi', 'wallet', 'giftcard', 'split'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  tip: {
    type: Number,
    default: 0
  },
  transactionId: String,
  cardDetails: {
    last4: String,
    cardType: String,
    authCode: String
  },
  upiDetails: {
    vpa: String,
    transactionId: String
  },
  giftCardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GiftCard'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  orderType: {
    type: String,
    enum: ['dine-in', 'takeaway', 'delivery', 'curbside'],
    required: true
  },
  tableId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table'
  },
  tableNumber: Number,
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customerInfo: {
    name: String,
    phone: String,
    email: String
  },
  serverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  tax: {
    type: Number,
    required: true,
    min: 0
  },
  taxBreakdown: [{
    name: String,
    rate: Number,
    amount: Number
  }],
  discount: {
    type: {
      type: String,
      enum: ['percentage', 'fixed', 'coupon']
    },
    value: Number,
    code: String,
    amount: Number
  },
  discountBreakdown: [{
    type: String,
    name: String,
    amount: Number
  }],
  serviceCharge: {
    type: Number,
    default: 0
  },
  packagingCharge: {
    type: Number,
    default: 0
  },
  deliveryCharge: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  payments: [paymentSchema],
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'paid', 'refunded'],
    default: 'unpaid'
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'],
    default: 'pending'
  },
  kitchenStatus: {
    type: String,
    enum: ['pending', 'preparing', 'ready', 'served'],
    default: 'pending'
  },
  priority: {
    type: Number,
    default: 0
  },
  timing: {
    orderedAt: { type: Date, default: Date.now },
    confirmedAt: Date,
    preparingAt: Date,
    readyAt: Date,
    completedAt: Date,
    cancelledAt: Date
  },
  notes: String,
  specialRequests: String,
  source: {
    type: String,
    enum: ['pos', 'online', 'aggregator', 'kiosk'],
    default: 'pos'
  },
  aggregatorInfo: {
    platform: String,
    orderId: String,
    restaurantId: String
  },
  deliveryInfo: {
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String
    },
    contactNumber: String,
    instructions: String,
    deliveryPersonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    deliveredAt: Date
  },
  feedback: {
    rating: Number,
    comment: String,
    receivedAt: Date
  },
  offlineId: String,
  syncedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ locationId: 1, orderStatus: 1 });
orderSchema.index({ locationId: 1, 'timing.orderedAt': -1 });
orderSchema.index({ customerId: 1 });
orderSchema.index({ tableId: 1 });
orderSchema.index({ offlineId: 1 });

// Pre-save middleware to generate order number
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    const count = await mongoose.model('Order').countDocuments({
      locationId: this.locationId,
      'timing.orderedAt': {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59, 999))
      }
    });
    
    this.orderNumber = `ORD-${year}${month}${day}-${(count + 1).toString().padStart(4, '0')}`;
  }
  next();
});

// Methods
orderSchema.methods.calculateTotals = function() {
  this.subtotal = this.items.reduce((sum, item) => sum + item.price, 0);
  this.total = this.subtotal + this.tax + this.serviceCharge + this.packagingCharge + this.deliveryCharge;
  
  if (this.discount && this.discount.amount) {
    this.total -= this.discount.amount;
  }
  
  return {
    subtotal: this.subtotal,
    tax: this.tax,
    total: this.total
  };
};

orderSchema.methods.updatePaymentStatus = function() {
  const totalPaid = this.payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);
  
  if (totalPaid >= this.total) {
    this.paymentStatus = 'paid';
  } else if (totalPaid > 0) {
    this.paymentStatus = 'partially_paid';
  } else {
    this.paymentStatus = 'unpaid';
  }
  
  return this.paymentStatus;
};

// Statics
orderSchema.statics.getDailySummary = async function(locationId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const orders = await this.find({
    locationId,
    'timing.orderedAt': { $gte: startOfDay, $lte: endOfDay },
    paymentStatus: 'paid'
  });
  
  const summary = {
    totalOrders: orders.length,
    totalRevenue: orders.reduce((sum, order) => sum + order.total, 0),
    byOrderType: {},
    byPaymentMethod: {}
  };
  
  orders.forEach(order => {
    // Group by order type
    if (!summary.byOrderType[order.orderType]) {
      summary.byOrderType[order.orderType] = { count: 0, revenue: 0 };
    }
    summary.byOrderType[order.orderType].count++;
    summary.byOrderType[order.orderType].revenue += order.total;
    
    // Group by payment method
    order.payments.forEach(payment => {
      if (!summary.byPaymentMethod[payment.method]) {
        summary.byPaymentMethod[payment.method] = { count: 0, amount: 0 };
      }
      summary.byPaymentMethod[payment.method].count++;
      summary.byPaymentMethod[payment.method].amount += payment.amount;
    });
  });
  
  return summary;
};

orderSchema.statics.getKitchenOrders = async function(locationId, station) {
  const query = {
    locationId,
    orderStatus: { $in: ['confirmed', 'preparing'] },
    'items.status': { $in: ['pending', 'preparing'] }
  };

  if (station) {
    query['items.station'] = station;
  }

  return this.find(query)
    .sort({ 'timing.orderedAt': 1 })
    .populate('items.menuItemId', 'name preparationTime');
};

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;