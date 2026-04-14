import mongoose from 'mongoose';

const receiptSchema = new mongoose.Schema({
  receiptId: { type: String, required: true, unique: true },
  orderId: { type: String, required: true },
  orderNumber: { type: String, required: true },
  receiptData: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});

export default mongoose.model('Receipt', receiptSchema);