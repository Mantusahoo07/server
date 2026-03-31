import express from 'express';
import Table from '../models/Table.js';

const router = express.Router();

// Get all tables
router.get('/', async (req, res) => {
  try {
    const tables = await Table.find({}).sort({ tableNumber: 1 });
    res.json(tables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new table
router.post('/', async (req, res) => {
  try {
    const { tableNumber, capacity, section, status } = req.body;
    
    const existingTable = await Table.findOne({ tableNumber });
    if (existingTable) {
      return res.status(400).json({ error: 'Table number already exists' });
    }
    
    const table = new Table({
      tableNumber,
      capacity: capacity || 4,
      section: section || 'Main Hall',
      status: status || 'available'
    });
    
    await table.save();
    res.status(201).json(table);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update table
router.patch('/:tableNumber', async (req, res) => {
  try {
    const { capacity, section, status } = req.body;
    const table = await Table.findOneAndUpdate(
      { tableNumber: req.params.tableNumber },
      { capacity, section, status, updatedAt: new Date() },
      { new: true }
    );
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(table);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete table
router.delete('/:tableNumber', async (req, res) => {
  try {
    const table = await Table.findOneAndDelete({ tableNumber: req.params.tableNumber });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json({ message: 'Table deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize tables (20 tables)
router.post('/initialize', async (req, res) => {
  try {
    await Table.deleteMany({});
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
