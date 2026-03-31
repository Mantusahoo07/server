import express from 'express';
import Order from '../models/Order.js';

const router = express.Router();

// Get all tables with status
router.get('/', async (req, res) => {
  try {
    // Get all active dine-in orders
    const activeOrders = await Order.find({
      orderType: 'dine-in',
      status: { $in: ['pending', 'accepted', 'preparing'] },
      tableNumber: { $ne: null }
    });
    
    const occupiedTableNumbers = activeOrders.map(o => o.tableNumber);
    
    // Create tables 1-20
    const tables = Array.from({ length: 20 }, (_, i) => ({
      number: i + 1,
      status: occupiedTableNumbers.includes(i + 1) ? 'occupied' : 'available',
      currentOrder: activeOrders.find(o => o.tableNumber === i + 1) || null
    }));
    
    res.json(tables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
