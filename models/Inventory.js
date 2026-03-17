const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['produce', 'meat', 'dairy', 'dry-goods', 'beverages', 'supplies']
  },
  description: String,
  unit: {
    type: String,
    required: true,
    enum: ['kg', 'g', 'lb', 'oz', 'liter', 'ml', 'piece', 'dozen', 'case']
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  minQuantity: {
    type: Number,
    required: true,
    min: 0
  },
  maxQuantity: {
    type: Number,
    required: true,
    min: 0
  },
  reorderPoint: {
    type: Number,
    required: true,
    min: 0
  },
  reorderQuantity: {
    type: Number,
    required: true,
    min: 0
  },
  cost: {
    average: Number,
    last: Number,
    current: Number
  },
  sellingPrice: Number,
  supplierInfo: {
    primarySupplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier'
    },
    sku: String,
    manufacturer: String
  },
  storage: {
    location: String,
    zone: String,
    temperature: {
      min: Number,
      max: Number
    }
  },
  batchTracking: {
    enabled: Boolean,
    batches: [{
      batchNumber: String,
      quantity: Number,
      receivedDate: Date,
      expiryDate: Date,
      cost: Number
    }]
  },
  expiryDate: Date,
  barcode: String,
  status: {
    type: String,
    enum: ['active', 'discontinued'],
    default: 'active'
  },
  alerts: [{
    type: {
      type: String,
      enum: ['low-stock', 'expiring-soon', 'expired']
    },
    message: String,
    createdAt: Date,
    resolved: Boolean
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const inventoryTransactionSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  ingredientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ingredient',
    required: true
  },
  type: {
    type: String,
    enum: ['purchase', 'sale', 'adjustment', 'waste', 'transfer'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  previousQuantity: Number,
  newQuantity: Number,
  unit: String,
  cost: Number,
  reference: {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder'
    },
    reason: String
  },
  notes: String,
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const supplierSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  contactPerson: String,
  email: String,
  phone: String,
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String
  },
  paymentTerms: String,
  leadTime: Number,
  categories: [String],
  status: {
    type: String,
    enum: ['active', 'inactive'],
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

const purchaseOrderSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  poNumber: {
    type: String,
    required: true,
    unique: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  items: [{
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient'
    },
    name: String,
    quantity: Number,
    unit: String,
    price: Number,
    totalPrice: Number
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  status: {
    type: String,
    enum: ['draft', 'sent', 'received', 'cancelled'],
    default: 'draft'
  },
  orderDate: Date,
  expectedDeliveryDate: Date,
  receivedDate: Date,
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const Ingredient = mongoose.model('Ingredient', ingredientSchema);
const InventoryTransaction = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
const Supplier = mongoose.model('Supplier', supplierSchema);
const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

module.exports = {
  Ingredient,
  InventoryTransaction,
  Supplier,
  PurchaseOrder
};