import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  icon: { type: String, default: '📦' },
  bgColor: { type: String, default: '#95a5a6' },
  sortOrder: { type: Number, default: 0 },
  showInKitchen: { type: Boolean, default: true },
  showInMenu: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Category', categorySchema);