import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
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

// Update timestamp on save
categorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

export default Category;
