import express from 'express';
import Order from '../models/Order.js';
import Table from '../models/Table.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Helper to generate unique table session ID
const generateTableSessionId = (tableNumber) => {
  return `table_${tableNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to update table status
const updateTableStatusFromOrders = async (tableNumber, io) => {
  if (!tableNumber) return 0;
  
  const activeOrdersCount = await Order.countDocuments({
    tableNumber: tableNumber,
    status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] },
    'payment.status': { $ne: 'paid' }
  });
  
  const table = await Table.findOne({ tableNumber: tableNumber });
  
  if (table) {
    const newStatus = activeOrdersCount > 0 ? 'running' : 'available';
    table.status = newStatus;
    table.runningOrderCount = activeOrdersCount;
    
    if (activeOrdersCount === 0) {
      table.currentSessionId = null;
      table.baseOrderNumber = null;
    }
    
    await table.save();
    
    if (io) {
      io.emit('table-status-changed', { 
        tableNumber, 
        status: newStatus, 
        runningOrderCount: activeOrdersCount 
      });
    }
  }
  
  return activeOrdersCount;
};

// Get all orders
router.get('/', authenticate, async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active orders for a specific table
router.get('/table/:tableNumber/active', authenticate, async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    const activeOrders = await Order.find({
      tableNumber: tableNumber,
      status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] },
      'payment.status': { $ne: 'paid' }
    }).sort({ runningNumber: 1 });
    
    res.json(activeOrders);
  } catch (error) {
    console.error('Error fetching table orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get order by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new order
router.post('/', authenticate, async (req, res) => {
  try {
    const orderData = req.body;
    
    // REMOVE any _id that might come from frontend
    delete orderData._id;
    delete orderData.id;
    
    let baseOrderNumber;
    let runningNumber;
    let tableSessionId;
    let isAdditionalOrder = false;
    
    console.log('📝 Creating order:', JSON.stringify(orderData, null, 2));
    
    // Handle table session for dine-in orders
    if (orderData.orderType === 'dine-in' && orderData.tableNumber) {
      let table = await Table.findOne({ tableNumber: orderData.tableNumber });
      
      if (!table) {
        table = new Table({
          tableNumber: orderData.tableNumber,
          status: 'available',
          capacity: 4
        });
        await table.save();
      }
      
      // Check if table has an active session (running orders)
      if (table.status === 'running' && table.currentSessionId && table.baseOrderNumber) {
        // Additional order for existing table session
        tableSessionId = table.currentSessionId;
        isAdditionalOrder = true;
        baseOrderNumber = table.baseOrderNumber;
        runningNumber = table.runningOrderCount; // This will be 1, 2, 3, etc.
        
        console.log(`📝 Additional order for table ${orderData.tableNumber}: baseOrderNumber=${baseOrderNumber}, runningNumber=${runningNumber}`);
      } else {
        // FIRST ORDER AFTER TABLE IS AVAILABLE - Start new session
        tableSessionId = generateTableSessionId(orderData.tableNumber);
        isAdditionalOrder = false;
        runningNumber = 0; // First order has no suffix
        
        // Generate NEW base order number (increment from last order overall)
        const lastOrder = await Order.findOne().sort({ baseOrderNumber: -1 });
        baseOrderNumber = lastOrder ? lastOrder.baseOrderNumber + 1 : 1000000;
        
        // Update table with new session
        table.currentSessionId = tableSessionId;
        table.baseOrderNumber = baseOrderNumber;
        table.status = 'running';
        table.runningOrderCount = 1; // First order
        await table.save();
        
        console.log(`📝 NEW SESSION - First order for table ${orderData.tableNumber}: baseOrderNumber=${baseOrderNumber}`);
      }
    } else {
      // Non dine-in orders
      const lastOrder = await Order.findOne().sort({ baseOrderNumber: -1 });
      baseOrderNumber = lastOrder ? lastOrder.baseOrderNumber + 1 : 1000000;
      runningNumber = 0;
    }
    
    const displayOrderNumber = runningNumber === 0 ? `${baseOrderNumber}` : `${baseOrderNumber}-${runningNumber}`;
    
    // Create order
    const order = new Order({
      ...orderData,
      baseOrderNumber,
      runningNumber,
      displayOrderNumber,
      tableSessionId,
      isAdditionalOrder,
      isRunningOrder: runningNumber > 0,
      createdBy: req.userId,
      timerStart: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const savedOrder = await order.save();
    console.log(`✅ Order saved: ${displayOrderNumber} (ID: ${savedOrder._id})`);
    
    // Update table running order count after order is saved (only for additional orders)
    if (orderData.orderType === 'dine-in' && orderData.tableNumber && isAdditionalOrder) {
      const table = await Table.findOne({ tableNumber: orderData.tableNumber });
      if (table) {
        table.runningOrderCount = table.runningOrderCount + 1;
        await table.save();
        console.log(`Table ${orderData.tableNumber} running order count updated to ${table.runningOrderCount}`);
      }
    }
    
    const io = req.app.get('io');
    
    // Emit events
    if (io) {
      io.emit('new-order', savedOrder);
      io.emit('order-updated', savedOrder);
      io.emit('new-order-received', savedOrder);
      
      if (orderData.orderType === 'dine-in' && orderData.tableNumber) {
        const updatedTable = await Table.findOne({ tableNumber: orderData.tableNumber });
        io.emit('table-status-changed', { 
          tableNumber: orderData.tableNumber, 
          status: 'running',
          runningOrderCount: updatedTable?.runningOrderCount || 1,
          baseOrderNumber: updatedTable?.baseOrderNumber
        });
      }
    }
    
    res.status(201).json(savedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add item to order
router.post('/:id/items', authenticate, async (req, res) => {
  try {
    const { item } = req.body;
    
    if (!item || !item.id) {
      return res.status(400).json({ error: 'Item ID is required' });
    }
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const newItem = {
      id: item.id,
      name: item.name || 'Unknown Item',
      quantity: item.quantity || 1,
      price: item.price || 0,
      specialInstructions: item.specialInstructions || '',
      status: 'pending',
      isModified: true,
      isRemoved: false,
      modifiedAt: new Date(),
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      categorySortOrder: item.categorySortOrder || 999
    };
    
    const existingItem = order.items.find(i => i.id === newItem.id);
    if (existingItem) {
      existingItem.oldQuantity = existingItem.quantity;
      existingItem.quantity += newItem.quantity;
      existingItem.isModified = true;
      existingItem.modifiedAt = new Date();
    } else {
      order.items.push(newItem);
    }
    
    // Update totals
    order.subtotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    order.tax = order.subtotal * (order.taxRate / 100);
    order.serviceCharge = order.subtotal * (order.serviceChargeRate / 100);
    order.total = order.subtotal + order.tax + order.serviceCharge;
    order.updatedAt = new Date();
    order.hasModifications = true;
    
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
      io.emit('order-item-added', { orderId: order._id, item: newItem });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove item from order
router.delete('/:id/items/:itemId', authenticate, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.items = order.items.filter(i => i.id !== req.params.itemId);
    
    // Update totals
    order.subtotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    order.tax = order.subtotal * (order.taxRate / 100);
    order.serviceCharge = order.subtotal * (order.serviceChargeRate / 100);
    order.total = order.subtotal + order.tax + order.serviceCharge;
    order.updatedAt = new Date();
    order.hasModifications = true;
    
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
      io.emit('order-item-removed', { orderId: order._id, itemId: req.params.itemId });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error removing item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item quantity
router.patch('/:id/items/:itemId', authenticate, async (req, res) => {
  try {
    const { quantity } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const item = order.items.find(i => i.id === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const oldQuantity = item.quantity;
    item.oldQuantity = oldQuantity;
    item.quantity = quantity;
    item.isModified = true;
    item.modifiedAt = new Date();
    
    // Update totals
    order.subtotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    order.tax = order.subtotal * (order.taxRate / 100);
    order.serviceCharge = order.subtotal * (order.serviceChargeRate / 100);
    order.total = order.subtotal + order.tax + order.serviceCharge;
    order.updatedAt = new Date();
    order.hasModifications = true;
    
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating quantity:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update order status
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const updateData = { 
      status, 
      updatedAt: new Date() 
    };
    
    if (status === 'completed') {
      updateData.completedAt = new Date();
      updateData.completedBy = req.userId;
    }
    
    if (status === 'accepted') {
      updateData.acceptedBy = req.userId;
    }
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
      if (status === 'accepted') io.emit('order-accepted', order._id);
      if (status === 'ready_for_billing') io.emit('order-ready-for-billing', order._id);
      if (status === 'completed') io.emit('order-completed', order._id);
      
      if ((status === 'cancelled' || status === 'completed') && order.tableNumber) {
        await updateTableStatusFromOrders(order.tableNumber, io);
      }
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item status
router.patch('/:id/items/:itemId/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const item = order.items.find(i => i.id === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    item.status = status;
    if (status === 'completed') {
      item.completedAt = new Date();
    }
    
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
      io.emit('item-status-updated', { orderId: order._id, itemId: req.params.itemId, status });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete payment
router.patch('/:id/complete-payment', authenticate, async (req, res) => {
  try {
    const { paymentMethod, paymentDetails, status, completedAt } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.payment = {
      method: paymentMethod,
      status: paymentMethod === 'credit' ? 'credit_due' : 'paid',
      amount: paymentDetails.amount,
      transactionId: paymentDetails.transactionId,
      timestamp: new Date(),
      dueDate: paymentDetails.dueDate,
      customerName: paymentDetails.customerName,
      customerPhone: paymentDetails.customerPhone
    };
    
    if (status) order.status = status;
    if (completedAt) order.completedAt = new Date(completedAt);
    order.completedBy = req.userId;
    order.updatedAt = new Date();
    
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
      if (status === 'completed') io.emit('order-completed', order._id);
      
      if (order.tableNumber) {
        await updateTableStatusFromOrders(order.tableNumber, io);
      }
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete billing for table (close all orders and reset table)
router.post('/table/:tableNumber/complete-billing', authenticate, async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    
    const activeOrders = await Order.find({
      tableNumber: tableNumber,
      status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] },
      'payment.status': { $ne: 'paid' }
    });
    
    if (activeOrders.length === 0) {
      return res.status(404).json({ error: 'No active orders found for this table' });
    }
    
    // Complete all active orders
    for (const order of activeOrders) {
      order.status = 'completed';
      order.completedAt = new Date();
      order.completedBy = req.userId;
      order.payment.status = 'paid';
      await order.save();
    }
    
    // RESET TABLE - Clear session and base order number
    const table = await Table.findOne({ tableNumber: tableNumber });
    if (table) {
      table.status = 'available';
      table.currentSessionId = null;
      table.baseOrderNumber = null;
      table.runningOrderCount = 0;
      await table.save();
      console.log(`✅ Table ${tableNumber} reset to available, session cleared`);
    }
    
    const io = req.app.get('io');
    if (io) {
      io.emit('table-billing-completed', { tableNumber, orders: activeOrders });
      io.emit('table-status-changed', { 
        tableNumber, 
        status: 'available', 
        runningOrderCount: 0,
        reset: true 
      });
    }
    
    res.json({ 
      message: `Billing completed for table ${tableNumber}`,
      count: activeOrders.length,
      tableReset: true
    });
  } catch (error) {
    console.error('Error completing table billing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Credit sale
router.post('/:id/credit-sale', authenticate, async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, dueDate } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.payment = {
      method: 'credit',
      status: 'credit_due',
      amount: order.total,
      transactionId: `CREDIT_${Date.now()}`,
      timestamp: new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      customerName: customerName,
      customerPhone: customerPhone
    };
    
    order.status = 'completed';
    order.completedAt = new Date();
    order.completedBy = req.userId;
    order.customer = {
      name: customerName,
      phone: customerPhone,
      email: customerEmail || ''
    };
    
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
      
      if (order.tableNumber) {
        await updateTableStatusFromOrders(order.tableNumber, io);
      }
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error processing credit sale:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
