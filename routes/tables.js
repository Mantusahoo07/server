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

// Get available tables
router.get('/available', async (req, res) => {
  try {
    const tables = await Table.find({ status: 'available' }).sort({ tableNumber: 1 });
    res.json(tables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update table status
router.patch('/:tableNumber/status', async (req, res) => {
  try {
    const { status, orderId } = req.body;
    const table = await Table.findOneAndUpdate(
      { tableNumber: req.params.tableNumber },
      { status, currentOrderId: orderId, updatedAt: new Date() },
      { new: true }
    );
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(table);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize tables (run once)
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
    res.json({ message: 'Tables initialized', count: tables.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
