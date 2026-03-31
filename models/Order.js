import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  orderNumber: Number,
  items: [{
    id: String,
    name: String,
    quantity: Number,
    price: Number,
    specialInstructions: String,
    status: { type: String, default: 'pending' },
    completedAt: Date
  }],
  subtotal: Number,
  tax: Number,
  total: Number,
  status: {
    type: String,
    enum: ['pending', 'accepted', 'preparing', 'completed', 'cancelled'],
    default: 'pending'
  },
  orderType: { type: String, default: 'dine-in' },
  tableNumber: String,
  customer: {
    name: String,
    phone: String,
    email: String
  },
  payment: {
    method: String,
    status: String,
    amount: Number,
    transactionId: String,
    timestamp: Date
  },
  timerStart: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Check if model already exists before creating
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
