import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  prepTime: { type: Number, default: 10 },
  available: { type: Boolean, default: true },
  description: String,
  ingredients: [String],
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('MenuItem', menuItemSchema);