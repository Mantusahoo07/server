import mongoose from 'mongoose';

const printJobSchema = new mongoose.Schema({
  receiptData:  { type: Object, required: true },
  paperWidth:   { type: Number, default: 58 },

  status: {
    type: String,
    enum: ['pending', 'printing', 'done', 'failed', 'expired'],
    default: 'pending',
    index: true
  },
  error: { type: String, default: null },

  requestedBy:     { type: String, default: null },
  requestedByName: { type: String, default: null },
  requestedAt:     { type: Date,   default: Date.now },

  // Which host should print this? Set to the host's deviceId at enqueue time.
  targetHostId:    { type: String, default: null, index: true },

  printedBy:       { type: String, default: null },
  printedAt:       { type: Date,   default: null },
  printAttempts:   { type: Number, default: 0 },

  // Jobs auto-expire 30s after creation if not picked up.
  expireAt:        { type: Date,   default: () => new Date(Date.now() + 30_000), index: true }
}, { timestamps: true });

printJobSchema.index({ status: 1, targetHostId: 1, createdAt: 1 });

export default mongoose.model('PrintJob', printJobSchema);
