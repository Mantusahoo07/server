import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  fullName: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  category: String,
  categoryIcon: String,
  available: { type: Boolean, default: true },
  prepTime: Number
});

const cartSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  items: [cartItemSchema],
  specialInstructions: { type: Map, of: String, default: {} },
  orderType: { type: String, default: 'dine-in' },
  deliveryPlatform: { type: String, default: 'home' },
  deliveryAddress: { type: String, default: '' },
  customerName: { type: String, default: '' },
  customerPhone: { type: String, default: '' },
  tableNumber: { type: Number, default: null },
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// Generate a simple session ID
cartSchema.statics.generateSessionId = function() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);

export default Cart;
