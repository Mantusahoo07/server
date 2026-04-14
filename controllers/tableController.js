import Table from '../models/Table.js';
import Order from '../models/Order.js';

export const getTables = async (req, res) => {
  try {
    const tables = await Table.find({}).sort({ tableNumber: 1 });
    
    const tablesWithDetails = await Promise.all(tables.map(async (table) => {
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
    
    res.json(tablesWithDetails);
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getTableByNumber = async (req, res) => {
  try {
    const table = await Table.findOne({ tableNumber: req.params.tableNumber });
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    const activeOrders = await Order.find({
      tableNumber: parseInt(req.params.tableNumber),
      status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] }
    });
    
    const totalAmount = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    
    res.json({
      ...table.toObject(),
      runningOrders: activeOrders,
      runningOrderCount: activeOrders.length,
      totalRunningAmount: totalAmount
    });
  } catch (error) {
    console.error('Error fetching table:', error);
    res.status(500).json({ error: error.message });
  }
};

export const createTable = async (req, res) => {
  try {
    const { tableNumber, capacity, section } = req.body;
    
    const existingTable = await Table.findOne({ tableNumber });
    if (existingTable) {
      return res.status(400).json({ error: 'Table number already exists' });
    }
    
    const table = new Table({
      tableNumber: parseInt(tableNumber),
      capacity: capacity || 4,
      section: section || 'Main Hall',
      status: 'available'
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
    const { capacity, section, status } = req.body;
    
    const table = await Table.findOneAndUpdate(
      { tableNumber: parseInt(req.params.tableNumber) },
      { capacity, section, status, updatedAt: new Date() },
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
    const table = await Table.findOneAndDelete({ tableNumber: parseInt(req.params.tableNumber) });
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting table:', error);
    res.status(500).json({ error: error.message });
  }
};

export const initializeTables = async (req, res) => {
  try {
    const existingCount = await Table.countDocuments();
    if (existingCount > 0) {
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
    res.json({ message: '20 tables initialized successfully', tables });
  } catch (error) {
    console.error('Error initializing tables:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateTableStatus = async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    
    const activeOrdersCount = await Order.countDocuments({
      tableNumber,
      status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] }
    });
    
    const newStatus = activeOrdersCount > 0 ? 'running' : 'available';
    
    const table = await Table.findOneAndUpdate(
      { tableNumber },
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
    
    if (activeOrdersCount === 0) {
      table.currentSessionId = null;
      table.baseOrderNumber = null;
      await table.save();
    }
    
    res.json({ table, runningOrderCount: activeOrdersCount });
  } catch (error) {
    console.error('Error updating table status:', error);
    res.status(500).json({ error: error.message });
  }
};