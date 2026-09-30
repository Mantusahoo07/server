import mongoose from 'mongoose';

const printJobSchema = new mongoose.Schema({
  receiptData: { type: Object, required: true },
  paperWidth: { type: Number, default: 58 },

  status: {
    type: String,
    enum: ['pending', 'printing', 'done', 'failed'],
    default: 'pending',
    index: true
  },
  error: { type: String, default: null },

  requestedBy:     { type: String, default: null },
  requestedByName: { type: String, default: null },
  requestedAt:     { type: Date,   default: Date.now },

  printedBy:       { type: String, default: null },
  printedAt:       { type: Date,   default: null },
  printAttempts:   { type: Number, default: 0 }
}, { timestamps: true });

printJobSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('PrintJob', printJobSchema);
