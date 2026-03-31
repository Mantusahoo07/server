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
      io.emit('new-order', order);
      io.emit('order-updated', order);
    }
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update order status - FIXED to save completedAt
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    console.log(`Updating order ${req.params.id} to status: ${status}`);
    
    const updateData = { 
      status, 
      updatedAt: new Date() 
    };
    
    // If status is being set to completed, also set completedAt timestamp
    if (status === 'completed') {
      updateData.completedAt = new Date();
      console.log(`✅ Order ${req.params.id} completed at:`, updateData.completedAt);
    }
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
      if (status === 'accepted') io.emit('order-accepted', order._id);
      if (status === 'completed') io.emit('order-completed', order._id);
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item status
router.patch('/:id/items/:itemId', async (req, res) => {
  try {
    const { status } = req.body;
    console.log(`🔄 Updating item ${req.params.itemId} to status: ${status}`);
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      console.log('❌ Order not found:', req.params.id);
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const itemIndex = order.items.findIndex(item => item.id === req.params.itemId);
    if (itemIndex === -1) {
      console.log('❌ Item with ID not found:', req.params.itemId);
      const itemByMongoId = order.items.find(item => item._id && item._id.toString() === req.params.itemId);
      if (itemByMongoId) {
        console.log('Found item by MongoDB _id');
        itemByMongoId.status = status;
        if (status === 'completed') {
          itemByMongoId.completedAt = new Date();
        }
        await order.save();
        console.log('✅ Item status updated successfully via MongoDB _id');
        
        const io = req.app.get('io');
        if (io) {
          io.emit('order-updated', order);
        }
        
        return res.json(order);
      }
      return res.status(404).json({ error: 'Item not found' });
    }
    
    order.items[itemIndex].status = status;
    if (status === 'completed') {
      order.items[itemIndex].completedAt = new Date();
    }
    
    await order.save();
    console.log('✅ Item status updated successfully');
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
    }
    
    res.json(order);
  } catch (error) {
    console.error('❌ Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
