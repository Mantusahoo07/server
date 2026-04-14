import express from 'express';
import Table from '../models/Table.js';
import Order from '../models/Order.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const tables = await Table.find({}).sort({ tableNumber: 1 });
    
    const enriched = await Promise.all(tables.map(async (table) => {
      const activeOrders = await Order.find({
        tableNumber: table.tableNumber,
        status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] }
      });
      
      const totalAmount = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      
      return {
        ...table.toObject(),
        runningOrderCount: activeOrders.length,
        totalRunningAmount: totalAmount
      };
    }));
    
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { tableNumber, capacity } = req.body;
    const existing = await Table.findOne({ tableNumber });
    if (existing) return res.status(400).json({ error: 'Table already exists' });
    
    const table = new Table({ tableNumber, capacity });
    await table.save();
    res.status(201).json(table);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:tableNumber', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { capacity, status } = req.body;
    const table = await Table.findOneAndUpdate(
      { tableNumber: req.params.tableNumber },
      { capacity, status, updatedAt: new Date() },
      { new: true }
    );
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(table);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:tableNumber', authenticate, authorize('admin'), async (req, res) => {
  try {
    await Table.findOneAndDelete({ tableNumber: req.params.tableNumber });
    res.json({ message: 'Table deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/initialize', authenticate, authorize('admin'), async (req, res) => {
  try {
    const existing = await Table.countDocuments();
    if (existing > 0) {
      return res.status(400).json({ error: 'Tables already exist' });
    }
    
    const tables = [];
    for (let i = 1; i <= 20; i++) {
      tables.push({
        tableNumber: i,
        status: 'available',
        capacity: i <= 10 ? 4 : 6,
        section: i <= 10 ? 'Main Hall' : 'Back Hall'
      });
    }
    
    await Table.insertMany(tables);
    res.json({ message: '20 tables initialized', tables });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;