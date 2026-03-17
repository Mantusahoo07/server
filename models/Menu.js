const mongoose = require('mongoose');

const modifierOptionSchema = new mongoose.Schema({
  id: String,
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    default: 0
  },
  calories: Number,
  isDefault: {
    type: Boolean,
    default: false
  },
  available: {
    type: Boolean,
    default: true
  }
});

const modifierGroupSchema = new mongoose.Schema({
  id: String,
  name: {
    type: String,
    required: true
  },
  description: String,
  minSelect: {
    type: Number,
    default: 0
  },
  maxSelect: {
    type: Number,
    default: 1
  },
  required: {
    type: Boolean,
    default: false
  },
  options: [modifierOptionSchema],
  displayOrder: Number
});

const nutritionalInfoSchema = new mongoose.Schema({
  calories: Number,
  protein: Number,
  carbohydrates: Number,
  fat: Number,
  fiber: Number,
  sodium: Number,
  sugar: Number
});

const menuItemSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  price: {
    type: Number,
    required: true,
    min: 0
  },
  compareAtPrice: {
    type: Number,
    min: 0
  },
  cost: {
    type: Number,
    min: 0
  },
  category: {
    type: String,
    required: true
  },
  subcategory: String,
  cuisine: String,
  images: [{
    url: String,
    isPrimary: Boolean,
    caption: String
  }],
  dietary: [{
    type: String,
    enum: ['veg', 'non-veg', 'vegan', 'gluten-free', 'dairy-free', 'nut-free']
  }],
  allergens: [{
    name: String,
    icon: String
  }],
  nutritionalInfo: nutritionalInfoSchema,
  ingredients: [{
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient'
    },
    quantity: Number,
    unit: String
  }],
  preparationTime: {
    min: Number,
    max: Number
  },
  station: String,
  course: {
    type: String,
    enum: ['appetizer', 'main', 'dessert', 'beverage', 'side']
  },
  modifierGroups: [modifierGroupSchema],
  tags: [String],
  available: {
    type: Boolean,
    default: true
  },
  availableFrom: Date,
  availableTo: Date,
  availableDays: [{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  }],
  stockTracking: {
    enabled: Boolean,
    currentStock: Number,
    lowStockThreshold: Number
  },
  barcode: String,
  sku: String,
  displayOrder: Number,
  featured: {
    type: Boolean,
    default: false
  },
  popular: {
    type: Boolean,
    default: false
  },
  newItem: {
    type: Boolean,
    default: false
  },
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

// Indexes
menuItemSchema.index({ locationId: 1, category: 1 });
menuItemSchema.index({ locationId: 1, available: 1 });
menuItemSchema.index({ name: 'text', description: 'text' });
menuItemSchema.index({ barcode: 1 }, { sparse: true });

const categorySchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  image: String,
  displayOrder: Number,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const MenuItem = mongoose.model('MenuItem', menuItemSchema);
const Category = mongoose.model('Category', categorySchema);

module.exports = { MenuItem, Category };