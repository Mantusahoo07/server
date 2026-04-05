import mongoose from 'mongoose';

const tableSchema = new mongoose.Schema({
  tableNumber: {
    type: Number,
    required: true,
    unique: true,
    min: 1,
    max: 20
  },
  status: {
    type: String,
    enum: ['available', 'running'],
    default: 'available'
  },
  capacity: {
    type: Number,
    default: 4
  },
  section: {
    type: String,
    default: 'Main Hall'
  },
  currentSessionId: {
    type: String,
    default: null
  },
  baseOrderNumber: {
    type: Number,
    default: null
  },
  runningOrderCount: {
    type: Number,
    default: 0
  },
  currentOrderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Drop the old index if it exists (run this once)
// You may need to run this in MongoDB shell or via mongoose connection
// db.tables.dropIndex('tableNo_1');

const Table = mongoose.models.Table || mongoose.model('Table', tableSchema);

export default Table;
