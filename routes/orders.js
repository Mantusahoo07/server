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
// Update item status
router.patch('/:id/items/:itemId', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const item = order.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    item.status = status;
    if (status === 'completed') {
      item.completedAt = new Date();
    }
    
    await order.save();
    
    // Emit socket event for real-time sync
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update item status
router.patch('/:id/items/:itemId', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const item = order.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    item.status = status;
    if (status === 'completed') {
      item.completedAt = new Date();
    }
    
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
