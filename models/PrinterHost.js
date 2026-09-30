import mongoose from 'mongoose';

const printerHostSchema = new mongoose.Schema({
  // Singleton — always a single document with key: 'active'
  key:  { type: String, default: 'active', unique: true, index: true },

  deviceId:       { type: String, default: null },
  deviceName:     { type: String, default: null },
  enabledBy:      { type: String, default: null },   // userId
  enabledByName:  { type: String, default: null },
  enabledAt:      { type: Date,   default: null },

  // Heartbeat so we can detect stale hosts later
  lastSeenAt:     { type: Date,   default: null },

  // Counts for diagnostics
  jobsPrinted:    { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('PrinterHost', printerHostSchema);
