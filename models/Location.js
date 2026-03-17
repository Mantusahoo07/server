const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  number: {
    type: Number,
    required: true
  },
  capacity: {
    type: Number,
    required: true
  },
  section: String,
  status: {
    type: String,
    enum: ['available', 'occupied', 'reserved', 'waiting', 'needs-cleaning'],
    default: 'available'
  },
  position: {
    x: Number,
    y: Number
  },
  shape: {
    type: String,
    enum: ['circle', 'square', 'rectangle'],
    default: 'circle'
  },
  rotation: {
    type: Number,
    default: 0
  },
  currentOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  serverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }
});

const locationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true,
    unique: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  phone: String,
  email: String,
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  openingTime: String,
  closingTime: String,
  timezone: String,
  currency: {
    type: String,
    default: 'USD'
  },
  taxRate: {
    type: Number,
    default: 0
  },
  serviceCharge: {
    type: Number,
    default: 0
  },
  tables: [tableSchema],
  settings: {
    receiptHeader: String,
    receiptFooter: String,
    autoAcceptOrders: Boolean,
    kitchenPrinterEnabled: Boolean,
    customerDisplayEnabled: Boolean
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
locationSchema.index({ code: 1 });
locationSchema.index({ status: 1 });

const Location = mongoose.model('Location', locationSchema);
module.exports = Location;