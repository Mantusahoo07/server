import express from 'express';
import Order from '../models/Order.js';

const router = express.Router();

// Get all orders
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order by ID
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new order
router.post('/', async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      console.log('📡 New order:', order.orderNumber);
      io.emit('new-order-received', order);
      io.emit('order-updated', order);
    }
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: new Date() },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const io = req.app.get('io');
    if (io) {
      console.log('📡 Order status updated:', order.orderNumber, status);
      io.emit('order-updated', order);
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update item status - FIXED VERSION
router.patch('/:id/items/:itemId', async (req, res) => {
  try {
    const { status } = req.body;
    console.log(`🔄 Updating item ${req.params.itemId} to status: ${status}`);
    
    // Find the order
    const order = await Order.findById(req.params.id);
    if (!order) {
      console.log('❌ Order not found:', req.params.id);
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Find the item
    const item = order.items.id(req.params.itemId);
    if (!item) {
      console.log('❌ Item not found:', req.params.itemId);
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Update item status
    item.status = status;
    if (status === 'completed') {
      item.completedAt = new Date();
    }
    
    // Save the order
    await order.save();
    console.log('✅ Item status updated successfully');
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
    }
    
    // Return the updated order
    res.json(order);
  } catch (error) {
    console.error('❌ Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
