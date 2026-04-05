import express from 'express';
import Table from '../models/Table.js';
import Order from '../models/Order.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all tables with running order counts
router.get('/', async (req, res) => {
  try {
    const tables = await Table.find({}).sort({ tableNumber: 1 });
    
    // Enrich with active order details
    const tablesWithDetails = await Promise.all(tables.map(async (table) => {
      const activeOrders = await Order.find({
        tableNumber: table.tableNumber,
        status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] },
        'payment.status': { $ne: 'paid' }
      }).sort({ runningNumber: 1 });
      
      const totalAmount = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      
      return {
        ...table.toObject(),
        runningOrderCount: activeOrders.length,
        runningOrders: activeOrders.map(o => ({ 
          id: o._id,
          displayOrderNumber: o.displayOrderNumber, 
          orderNumber: o.orderNumber,
          runningNumber: o.runningNumber,
          total: o.total, 
          status: o.status,
          isRunningOrder: o.isRunningOrder
        })),
        totalRunningAmount: totalAmount,
        selectable: true
      };
    }));
    
    res.json(tablesWithDetails);
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get table by number with running orders
router.get('/:tableNumber', async (req, res) => {
  try {
    const table = await Table.findOne({ tableNumber: req.params.tableNumber });
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    const activeOrders = await Order.find({
      tableNumber: parseInt(req.params.tableNumber),
      status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] },
      'payment.status': { $ne: 'paid' }
    }).sort({ runningNumber: 1 });
    
    const totalAmount = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    
    res.json({
      ...table.toObject(),
      runningOrders: activeOrders.map(o => ({ 
        id: o._id,
        displayOrderNumber: o.displayOrderNumber,
        orderNumber: o.orderNumber,
        runningNumber: o.runningNumber,
        total: o.total, 
        status: o.status,
        items: o.items,
        isRunningOrder: o.isRunningOrder
      })),
      runningOrderCount: activeOrders.length,
      totalRunningAmount: totalAmount,
      selectable: true
    });
  } catch (error) {
    console.error('Error fetching table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add new table
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { tableNumber, capacity, section } = req.body;
    
    if (!tableNumber) {
      return res.status(400).json({ error: 'Table number is required' });
    }
    
    if (tableNumber < 1 || tableNumber > 100) {
      return res.status(400).json({ error: 'Table number must be between 1 and 100' });
    }
    
    const existingTable = await Table.findOne({ tableNumber });
    if (existingTable) {
      return res.status(400).json({ error: 'Table number already exists' });
    }
    
    const table = new Table({
      tableNumber: parseInt(tableNumber),
      capacity: capacity ? parseInt(capacity) : 4,
      section: section || 'Main Hall',
      status: 'available'
    });
    
    await table.save();
    console.log(`Table ${tableNumber} created successfully`);
    res.status(201).json(table);
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update table
router.patch('/:tableNumber', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { capacity, section, status } = req.body;
    
    // Prevent setting status to available if there are running orders
    if (status === 'available') {
      const activeOrdersCount = await Order.countDocuments({
        tableNumber: parseInt(req.params.tableNumber),
        status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] },
        'payment.status': { $ne: 'paid' }
      });
      
      if (activeOrdersCount > 0) {
        return res.status(400).json({ error: 'Cannot set table to available while orders are running. Complete billing first.' });
      }
    }
    
    const updateData = {};
    if (capacity !== undefined) updateData.capacity = parseInt(capacity);
    if (section !== undefined) updateData.section = section;
    if (status !== undefined) updateData.status = status;
    updateData.updatedAt = new Date();
    
    const table = await Table.findOneAndUpdate(
      { tableNumber: parseInt(req.params.tableNumber) },
      updateData,
      { new: true }
    );
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    const io = req.app.get('io');
    if (io) {
      io.emit('table-status-changed', { tableNumber: table.tableNumber, status: table.status });
    }
    
    res.json(table);
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete table
router.delete('/:tableNumber', authenticate, authorize('admin'), async (req, res) => {
  try {
    const table = await Table.findOne({ tableNumber: parseInt(req.params.tableNumber) });
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    const activeOrders = await Order.countDocuments({
      tableNumber: parseInt(req.params.tableNumber),
      status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] },
      'payment.status': { $ne: 'paid' }
    });
    
    if (activeOrders > 0) {
      return res.status(400).json({ error: 'Cannot delete table with running orders. Please complete or cancel all orders first.' });
    }
    
    await Table.findOneAndDelete({ tableNumber: parseInt(req.params.tableNumber) });
    res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update table status based on order count
router.patch('/:tableNumber/update-status', async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    
    const activeOrdersCount = await Order.countDocuments({
      tableNumber: tableNumber,
      status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] },
      'payment.status': { $ne: 'paid' }
    });
    
    const newStatus = activeOrdersCount > 0 ? 'running' : 'available';
    
    const table = await Table.findOneAndUpdate(
      { tableNumber: tableNumber },
      { 
        status: newStatus,
        runningOrderCount: activeOrdersCount,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // If no active orders, clear session
    if (activeOrdersCount === 0) {
      table.currentSessionId = null;
      table.baseOrderNumber = null;
      await table.save();
    }
    
    const io = req.app.get('io');
    if (io) {
      io.emit('table-status-changed', { tableNumber, status: newStatus, runningOrderCount: activeOrdersCount });
    }
    
    res.json({ table, runningOrderCount: activeOrdersCount });
  } catch (error) {
    console.error('Error updating table status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize default tables
router.post('/initialize', authenticate, authorize('admin'), async (req, res) => {
  try {
    const existingTables = await Table.countDocuments();
    if (existingTables > 0) {
      return res.status(400).json({ 
        error: 'Tables already exist. Use delete endpoints to remove existing tables first.' 
      });
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
    res.json({ 
      message: '20 tables initialized successfully', 
      tables,
      count: tables.length 
    });
  } catch (error) {
    console.error('Error initializing tables:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
