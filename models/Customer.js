import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  creditLimit: { type: Number, default: 0 },
  outstandingAmount: { type: Number, default: 0 },
  totalPurchases: { type: Number, default: 0 },
  lastPurchaseDate: Date,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Customer', customerSchema);