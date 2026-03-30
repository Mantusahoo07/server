import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  name: String,
  category: String,
  currentStock: Number,
  minimumStock: Number,
  maximumStock: Number,
  unit: String,
  unitPrice: Number,
  supplier: String,
  lastRestocked: Date,
  reorderPoint: Number,
  reorderQuantity: Number,
  location: String,
  batchNumber: String,
  expiryDate: Date,
  status: {
    type: String,
    enum: ['in-stock', 'low-stock', 'out-of-stock', 'discontinued'],
    default: 'in-stock'
  }
});

const inventoryTransactionSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory'
  },
  type: {
    type: String,
    enum: ['purchase', 'sale', 'adjustment', 'return', 'waste']
  },
  quantity: Number,
  previousStock: Number,
  newStock: Number,
  reason: String,
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export const Inventory = mongoose.model('Inventory', inventoryItemSchema);
export const InventoryTransaction = mongoose.model('InventoryTransaction', inventoryTransactionSchema);