import express from 'express';
import Table from '../models/Table.js';
import Order from '../models/Order.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all tables (public - for POS display)
router.get('/', async (req, res) => {
  try {
    const tables = await Table.find({}).sort({ tableNumber: 1 });
    
    // Enrich with active order count for each table
    const tablesWithOrderCount = await Promise.all(tables.map(async (table) => {
      const activeOrders = await Order.countDocuments({
        tableNumber: table.tableNumber,
        status: { $in: ['pending', 'accepted', 'preparing', 'hold'] },
        'payment.status': { $ne: 'paid' }
      });
      return {
        ...table.toObject(),
        activeOrderCount: activeOrders
      };
    }));
    
    res.json(tablesWithOrderCount);
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get table by number with active orders
router.get('/:tableNumber', async (req, res) => {
  try {
    const table = await Table.findOne({ tableNumber: req.params.tableNumber });
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    const activeOrders = await Order.find({
      tableNumber: parseInt(req.params.tableNumber),
      status: { $in: ['pending', 'accepted', 'preparing', 'hold'] },
      'payment.status': { $ne: 'paid' }
    }).sort({ createdAt: 1 });
    
    res.json({
      ...table.toObject(),
      activeOrders,
      activeOrderCount: activeOrders.length
    });
  } catch (error) {
    console.error('Error fetching table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add new table (admin/manager only)
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { tableNumber, capacity, section, status } = req.body;
    
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
      status: status || 'available'
    });
    
    await table.save();
    console.log(`Table ${tableNumber} created successfully`);
    res.status(201).json(table);
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update table (admin/manager only)
router.patch('/:tableNumber', authenticate, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { capacity, section, status, currentOrderId } = req.body;
    
    if (status && !['available', 'occupied', 'reserved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be available, occupied, or reserved' });
    }
    
    if (capacity !== undefined) {
      const capacityNum = parseInt(capacity);
      if (isNaN(capacityNum) || capacityNum < 1 || capacityNum > 20) {
        return res.status(400).json({ error: 'Capacity must be between 1 and 20' });
      }
    }
    
    const updateData = {};
    if (capacity !== undefined) updateData.capacity = parseInt(capacity);
    if (section !== undefined) updateData.section = section;
    if (status !== undefined) updateData.status = status;
    if (currentOrderId !== undefined) updateData.currentOrderId = currentOrderId;
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
    
    console.log(`Table ${table.tableNumber} updated successfully`);
    res.json(table);
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete table (admin only)
router.delete('/:tableNumber', authenticate, authorize('admin'), async (req, res) => {
  try {
    const table = await Table.findOne({ tableNumber: parseInt(req.params.tableNumber) });
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    if (table.status === 'occupied') {
      return res.status(400).json({ error: 'Cannot delete occupied table. Please clear the table first.' });
    }
    
    await Table.findOneAndDelete({ tableNumber: parseInt(req.params.tableNumber) });
    console.log(`Table ${req.params.tableNumber} deleted successfully`);
    res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update table status (for POS)
router.patch('/:tableNumber/status', async (req, res) => {
  try {
    const { status, orderId } = req.body;
    
    if (!status || !['available', 'occupied', 'reserved'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required (available, occupied, reserved)' });
    }
    
    const updateData = {
      status,
      updatedAt: new Date()
    };
    
    if (orderId) {
      updateData.currentOrderId = orderId;
    } else if (status === 'available') {
      updateData.currentOrderId = null;
    }
    
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
    console.error('Error updating table status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize default tables (admin only)
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
    console.log('20 tables initialized successfully');
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
