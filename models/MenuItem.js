import mongoose from 'mongoose';

const modifierSchema = new mongoose.Schema({
  name: String,
  price: Number,
  maxSelect: Number
});

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  subCategory: String,
  description: String,
  ingredients: [String],
  allergens: [String],
  calories: Number,
  prepTime: {
    type: Number,
    default: 10
  },
  available: {
    type: Boolean,
    default: true
  },
  availableQuantity: {
    type: Number,
    default: -1 // -1 means unlimited
  },
  modifiers: [modifierSchema],
  image: String,
  isPopular: {
    type: Boolean,
    default: false
  },
  isRecommended: {
    type: Boolean,
    default: false
  },
  taxRate: {
    type: Number,
    default: 0
  },
  sortOrder: Number,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('MenuItem', menuItemSchema);