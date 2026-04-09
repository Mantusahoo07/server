// models/Cart.js
import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  fullName: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  categoryId: { type: String, default: null },
  categoryName: { type: String, default: '' },
  categorySortOrder: { type: Number, default: 0 },
  prepTime: { type: Number, default: 10 },
  available: { type: Boolean, default: true }
});

const cartSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true  // One cart per user
  },
  sessionId: { type: String, default: null },
  items: [cartItemSchema],
  specialInstructions: { type: Map, of: String, default: {} },
  orderType: { type: String, default: 'dine-in' },
  deliveryPlatform: { type: String, default: null },
  deliveryAddress: { type: String, default: '' },
  customerName: { type: String, default: '' },
  customerPhone: { type: String, default: '' },
  tableNumber: { type: Number, default: null },
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// Index for faster queries
cartSchema.index({ userId: 1 });

const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);

export default Cart;
