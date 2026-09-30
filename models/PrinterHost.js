import mongoose from 'mongoose';

const printerHostSchema = new mongoose.Schema({
  key: { type: String, default: 'active', unique: true, index: true },

  deviceId:       { type: String, default: null },
  deviceName:     { type: String, default: null },
  enabledBy:      { type: String, default: null },
  enabledByName:  { type: String, default: null },
  enabledAt:      { type: Date,   default: null },

  lastSeenAt:     { type: Date,   default: null },
  jobsPrinted:    { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('PrinterHost', printerHostSchema);
