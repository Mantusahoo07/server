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
    
    // Emit socket event
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
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      console.log('📡 Order status updated:', order.orderNumber, status);
      io.emit('order-updated', order);
      if (status === 'accepted') io.emit('order-accepted', order._id);
      if (status === 'completed') io.emit('order-completed', order._id);
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update item status (SINGLE VERSION - REMOVED DUPLICATE)
router.patch('/:id/items/:itemId', async (req, res) => {
  try {
    const { status } = req.body;
    console.log(`Updating item ${req.params.itemId} to status: ${status}`);
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const item = order.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    item.status = status;
    if (status === 'completed') {
      item.completedAt = new Date();
    }
    
    await order.save();
    
    // Emit socket event for real-time sync
    const io = req.app.get('io');
    if (io) {
      console.log('📡 Item status updated:', item.name, status);
      io.emit('order-updated', order);
      io.emit('item-status-updated', { 
        orderId: req.params.id, 
        itemId: req.params.itemId, 
        status 
      });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
