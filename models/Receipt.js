import mongoose from 'mongoose';

const receiptSchema = new mongoose.Schema({
  receiptId: {
    type: String,
    required: true,
    unique: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  orderNumber: {
    type: String,
    required: true
  },
  receiptData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Auto-delete after 24 hours
  }
});

const Receipt = mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);

export default Receipt;
