import Table from '../models/Table.js';

export const getTables = async (req, res) => {
  try {
    const tables = await Table.find({}).sort({ tableNumber: 1 });
    res.json(tables);
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: error.message });
  }
};

export const createTable = async (req, res) => {
  try {
    const { tableNumber, capacity, status } = req.body;
    
    const existingTable = await Table.findOne({ tableNumber });
    if (existingTable) {
      return res.status(400).json({ error: 'Table number already exists' });
    }
    
    const table = new Table({
      tableNumber,
      capacity: capacity || 4,
      status: status || 'available'
    });
    
    await table.save();
    res.status(201).json(table);
  } catch (error) {
    console.error('Error creating table:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateTable = async (req, res) => {
  try {
    const { capacity, status } = req.body;
    const table = await Table.findOneAndUpdate(
      { tableNumber: req.params.tableNumber },
      { capacity, status, updatedAt: new Date() },
      { new: true }
    );
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    res.json(table);
  } catch (error) {
    console.error('Error updating table:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteTable = async (req, res) => {
  try {
    const table = await Table.findOneAndDelete({ tableNumber: req.params.tableNumber });
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ error: error.message });
  }
};
