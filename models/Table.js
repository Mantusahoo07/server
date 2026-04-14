import mongoose from 'mongoose';

const tableSchema = new mongoose.Schema({
  tableNumber: { type: Number, required: true, unique: true, min: 1, max: 100 },
  status: { type: String, enum: ['available', 'running'], default: 'available' },
  capacity: { type: Number, default: 4 },
  section: String,
  currentSessionId: String,
  baseOrderNumber: Number,
  runningOrderCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Table', tableSchema);