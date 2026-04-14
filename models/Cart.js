import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  fullName: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  categoryId: String,
  categoryName: String,
  categorySortOrder: { type: Number, default: 0 },
  prepTime: { type: Number, default: 10 }
});

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [cartItemSchema],
  specialInstructions: { type: Map, of: String, default: {} },
  orderType: { type: String, default: 'dine-in' },
  deliveryPlatform: String,
  tableNumber: Number,
  lastUpdated: { type: Date, default: Date.now }
});

export default mongoose.model('Cart', cartSchema);