import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  icon: {
    type: String,
    default: '📦'
  },
  bgColor: {
    type: String,
    default: '#95a5a6'
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  showInKitchen: {
    type: Boolean,
    default: true,
    description: 'Whether items in this category should appear in kitchen display'
  },
  showInMenu: {
    type: Boolean,
    default: true,
    description: 'Whether this category should appear in POS menu'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

categorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

export default Category;
