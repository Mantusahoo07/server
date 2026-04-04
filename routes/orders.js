import express from 'express';
import Order from '../models/Order.js';
import Table from '../models/Table.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Helper to generate unique table session ID
const generateTableSessionId = (tableNumber) => {
  return `table_${tableNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
};

// Helper function to get next running order number for a table
const getNextRunningOrderNumber = async (tableNumber) => {
  const lastOrderForTable = await Order.findOne({
    tableNumber: tableNumber,
    status: { $nin: ['cancelled'] }
  }).sort({ runningOrderNumber: -1 });
  
  if (lastOrderForTable && lastOrderForTable.runningOrderNumber) {
    return lastOrderForTable.runningOrderNumber + 1;
  }
  return 1;
};

// Helper function to update table status based on active orders
const updateTableStatusFromOrders = async (tableNumber, io) => {
  if (!tableNumber) return;
  
  const activeOrdersCount = await Order.countDocuments({
    tableNumber: tableNumber,
    status: { $in: ['pending', 'accepted', 'preparing', 'hold'] },
    'payment.status': { $ne: 'paid' }
  });
  
  const newStatus = activeOrdersCount > 0 ? 'running' : 'available';
  
  await Table.findOneAndUpdate(
    { tableNumber: tableNumber },
    { 
      status: newStatus,
      updatedAt: new Date()
    },
    { upsert: true }
  );
  
  if (io) {
    io.emit('table-status-changed', { 
      tableNumber, 
      status: newStatus, 
      runningOrderCount: activeOrdersCount 
    });
  }
  
  console.log(`Table ${tableNumber} status updated to: ${newStatus} (${activeOrdersCount} active orders)`);
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

// Get active orders for a specific table (running orders)
router.get('/table/:tableNumber/active', authenticate, async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    
    const activeOrders = await Order.find({
      tableNumber: tableNumber,
      status: { $in: ['pending', 'accepted', 'preparing', 'hold'] },
      'payment.status': { $ne: 'paid' }
    }).sort({ runningOrderNumber: 1 });
    
    res.json(activeOrders);
  } catch (error) {
    console.error('Error fetching table orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active table sessions (all tables with running orders)
router.get('/tables/active-sessions', authenticate, async (req, res) => {
  try {
    const activeTableOrders = await Order.aggregate([
      {
        $match: {
          tableNumber: { $ne: null },
          status: { $in: ['pending', 'accepted', 'preparing', 'hold'] },
          'payment.status': { $ne: 'paid' },
          isRemoved: { $ne: true }
        }
      },
      {
        $group: {
          _id: { tableNumber: '$tableNumber', tableSessionId: '$tableSessionId' },
          orders: { $push: '$$ROOT' },
          orderCount: { $sum: 1 },
          totalAmount: { $sum: '$total' },
          firstOrderTime: { $min: '$createdAt' },
          orderNumbers: { $push: '$orderNumber' },
          displayOrderNumbers: { $push: '$displayOrderNumber' }
        }
      },
      {
        $sort: { firstOrderTime: 1 }
      }
    ]);
    
    const sessions = activeTableOrders.map(session => ({
      tableNumber: session._id.tableNumber,
      tableSessionId: session._id.tableSessionId,
      orderCount: session.orderCount,
      totalAmount: session.totalAmount,
      orders: session.orders,
      orderNumbers: session.orderNumbers,
      displayOrderNumbers: session.displayOrderNumbers,
      firstOrderTime: session.firstOrderTime
    }));
    
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching active table sessions:', error);
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
    
    const lastOrder = await Order.findOne().sort({ orderNumber: -1 });
    const orderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1001;
    
    // Handle table session for dine-in orders
    let runningOrderNumber = 1;
    let displayOrderNumber = orderNumber.toString();
    
    if (orderData.orderType === 'dine-in' && orderData.tableNumber) {
      if (orderData.isAdditionalOrder && orderData.tableSessionId) {
        // This is an additional order for existing table session
        orderData.tableSessionId = orderData.tableSessionId;
        runningOrderNumber = await getNextRunningOrderNumber(orderData.tableNumber);
        displayOrderNumber = `${orderNumber}-${runningOrderNumber}`;
      } else {
        // First order for this table - create new session
        orderData.tableSessionId = generateTableSessionId(orderData.tableNumber);
        orderData.isAdditionalOrder = false;
        runningOrderNumber = 1;
        displayOrderNumber = `${orderNumber}-1`;
      }
    }
    
    const order = new Order({
      ...orderData,
      orderNumber,
      displayOrderNumber,
      runningOrderNumber,
      createdBy: req.userId,
      timerStart: new Date()
    });
    
    await order.save();
    
    const io = req.app.get('io');
    
    // Update table status based on active orders
    if (orderData.orderType === 'dine-in' && orderData.tableNumber) {
      const activeOrdersCount = await updateTableStatusFromOrders(orderData.tableNumber, io);
      
      if (io) {
        io.emit('new-order', order);
        io.emit('order-updated', order);
        io.emit('table-status-changed', { 
          tableNumber: orderData.tableNumber, 
          status: activeOrdersCount > 0 ? 'running' : 'available',
          runningOrderCount: activeOrdersCount
        });
        io.emit('table-order-added', {
          tableNumber: orderData.tableNumber,
          orderNumber: order.orderNumber,
          displayOrderNumber: displayOrderNumber,
          runningOrderNumber: runningOrderNumber,
          totalRunningOrders: activeOrdersCount
        });
      }
    } else {
      if (io) {
        io.emit('new-order', order);
        io.emit('order-updated', order);
      }
    }
    
    console.log(`✅ Order created: ${displayOrderNumber} for Table ${orderData.tableNumber || 'N/A'}`);
    res.status(201).json(order);
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
      io.emit('order-modified', { 
        orderId: order._id, 
        orderNumber: order.orderNumber,
        displayOrderNumber: order.displayOrderNumber,
        itemId: newItem.id,
        oldQuantity: existingItem?.oldQuantity,
        newQuantity: existingItem?.quantity
      });
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
    
    const itemIndex = order.items.findIndex(i => i.id === req.params.itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const removedItem = order.items[itemIndex];
    removedItem.isRemoved = true;
    removedItem.isModified = true;
    removedItem.removedAt = new Date();
    removedItem.quantity = 0;
    
    order.items.splice(itemIndex, 1);
    
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
      io.emit('order-modified', { 
        orderId: order._id, 
        orderNumber: order.orderNumber,
        displayOrderNumber: order.displayOrderNumber
      });
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
      io.emit('order-modified', { 
        orderId: order._id, 
        orderNumber: order.orderNumber,
        displayOrderNumber: order.displayOrderNumber,
        itemId: req.params.itemId,
        oldQuantity,
        newQuantity: quantity
      });
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
      
      // If order is cancelled or completed, update table status
      if ((status === 'cancelled' || status === 'completed') && order.tableNumber) {
        const activeOrdersCount = await updateTableStatusFromOrders(order.tableNumber, io);
        
        io.emit('table-status-changed', { 
          tableNumber: order.tableNumber, 
          status: activeOrdersCount > 0 ? 'running' : 'available',
          runningOrderCount: activeOrdersCount
        });
      }
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update item status (for kitchen display)
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

// Complete payment for order
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
      
      // Update table status after payment completion
      if (order.tableNumber) {
        const activeOrdersCount = await updateTableStatusFromOrders(order.tableNumber, io);
        
        io.emit('table-status-changed', { 
          tableNumber: order.tableNumber, 
          status: activeOrdersCount > 0 ? 'running' : 'available',
          runningOrderCount: activeOrdersCount
        });
      }
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete billing for table - sets table as available
router.post('/table/:tableNumber/complete-billing', authenticate, async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    const { sessionId } = req.body;
    
    const query = {
      tableNumber: tableNumber,
      status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] }
    };
    
    if (sessionId) {
      query.tableSessionId = sessionId;
    }
    
    const activeOrders = await Order.find(query);
    
    if (activeOrders.length === 0) {
      return res.status(404).json({ error: 'No active orders found for this table' });
    }
    
    const completedOrders = [];
    for (const order of activeOrders) {
      order.status = 'completed';
      order.completedAt = new Date();
      order.completedBy = req.userId;
      order.payment.status = 'paid';
      await order.save();
      completedOrders.push(order);
    }
    
    // Update table status to available (no more running orders)
    await Table.findOneAndUpdate(
      { tableNumber: tableNumber },
      { 
        status: 'available',
        updatedAt: new Date()
      },
      { upsert: true }
    );
    
    console.log(`✅ Billing completed for table ${tableNumber}, ${completedOrders.length} orders closed. Table status: available`);
    
    const io = req.app.get('io');
    if (io) {
      io.emit('table-billing-completed', { tableNumber, orders: completedOrders });
      io.emit('table-status-changed', { tableNumber, status: 'available', runningOrderCount: 0 });
    }
    
    res.json({ 
      message: `Billing completed for table ${tableNumber}`,
      orders: completedOrders,
      count: completedOrders.length,
      tableStatus: 'available'
    });
  } catch (error) {
    console.error('Error completing table billing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Credit sale
router.post('/:id/credit-sale', authenticate, async (req, res) => {
  try {
    const { customerId, customerName, customerPhone, customerEmail, dueDate } = req.body;
    
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
      
      // Update table status after credit sale completion
      if (order.tableNumber) {
        const activeOrdersCount = await updateTableStatusFromOrders(order.tableNumber, io);
        
        io.emit('table-status-changed', { 
          tableNumber: order.tableNumber, 
          status: activeOrdersCount > 0 ? 'running' : 'available',
          runningOrderCount: activeOrdersCount
        });
      }
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error processing credit sale:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
