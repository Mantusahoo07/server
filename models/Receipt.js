import mongoose from 'mongoose';

const receiptSchema = new mongoose.Schema({
  receiptId: { type: String, required: true, unique: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  orderNumber: { type: String, required: true },
  displayOrderNumber: { type: String },
  receiptData: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24 hours
});

receiptSchema.index({ receiptId: 1 });
receiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const Receipt = mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);

export default Receipt;
