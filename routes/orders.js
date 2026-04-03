import express from 'express';
import Order from '../models/Order.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get all orders
router.get('/', authenticate, async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    console.log(`Found ${orders.length} orders`);
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
    
    // Find all active orders for this table (not completed/cancelled)
    const activeOrders = await Order.find({
      tableNumber: tableNumber,
      status: { $in: ['pending', 'accepted', 'preparing', 'hold'] },
      payment: { $ne: { status: 'paid' } }
    }).sort({ createdAt: 1 });
    
    console.log(`Found ${activeOrders.length} active orders for table ${tableNumber}`);
    res.json(activeOrders);
  } catch (error) {
    console.error('Error fetching table orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get table session (all orders for a table including completed)
router.get('/table/:tableNumber/session', authenticate, async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    
    // Find all orders for this table
    const allOrders = await Order.find({
      tableNumber: tableNumber
    }).sort({ createdAt: 1 });
    
    // Group by session
    const sessions = {};
    allOrders.forEach(order => {
      const sessionId = order.tableSessionId || order._id.toString();
      if (!sessions[sessionId]) {
        sessions[sessionId] = [];
      }
      sessions[sessionId].push(order);
    });
    
    res.json({
      tableNumber,
      activeOrders: allOrders.filter(o => o.status !== 'completed' && o.status !== 'cancelled'),
      sessions: Object.values(sessions),
      allOrders
    });
  } catch (error) {
    console.error('Error fetching table session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new order (with table session support)
router.post('/', authenticate, async (req, res) => {
  try {
    const orderData = { ...req.body };
    
    // Generate order number
    const lastOrder = await Order.findOne().sort({ orderNumber: -1 });
    const orderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1001;
    
    // Handle table session for dine-in orders
    if (orderData.orderType === 'dine-in' && orderData.tableNumber) {
      // Check if there's an existing active order for this table
      const existingActiveOrder = await Order.findOne({
        tableNumber: orderData.tableNumber,
        status: { $in: ['pending', 'accepted', 'preparing', 'hold'] },
        payment: { $ne: { status: 'paid' } }
      });
      
      if (existingActiveOrder) {
        // This is an additional order for the same table
        orderData.isAdditionalOrder = true;
        orderData.parentOrderId = existingActiveOrder._id;
        orderData.tableSessionId = existingActiveOrder.tableSessionId || existingActiveOrder._id.toString();
        console.log(`Additional order for table ${orderData.tableNumber}, session: ${orderData.tableSessionId}`);
      } else {
        // First order for this table session
        orderData.isAdditionalOrder = false;
        orderData.parentOrderId = null;
        // Generate a new session ID
        orderData.tableSessionId = `table_${orderData.tableNumber}_${Date.now()}`;
        console.log(`New table session started for table ${orderData.tableNumber}, session: ${orderData.tableSessionId}`);
      }
    }
    
    const order = new Order({
      ...orderData,
      orderNumber,
      createdBy: req.userId,
      timerStart: new Date()
    });
    
    await order.save();
    console.log(`✅ Order created: ${order.orderNumber} for table ${order.tableNumber || 'takeaway'}`);
    
    const io = req.app.get('io');
    if (io) {
      io.emit('new-order-received', order);
      io.emit('order-updated', order);
      // Emit table-specific update
      if (order.tableNumber) {
        io.emit(`table-${order.tableNumber}-updated`, order);
      }
    }
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete billing for table (close table session)
router.post('/table/:tableNumber/complete-billing', authenticate, async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    const { sessionId } = req.body;
    
    // Find all active orders for this table session
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
    
    // Update all orders to completed
    const completedOrders = [];
    for (const order of activeOrders) {
      order.status = 'completed';
      order.completedAt = new Date();
      order.completedBy = req.userId;
      order.payment.status = 'paid';
      await order.save();
      completedOrders.push(order);
    }
    
    console.log(`✅ Billing completed for table ${tableNumber}, ${completedOrders.length} orders closed`);
    
    const io = req.app.get('io');
    if (io) {
      io.emit('table-billing-completed', { tableNumber, orders: completedOrders });
      io.emit(`table-${tableNumber}-billed`, { tableNumber, orders: completedOrders });
    }
    
    res.json({ 
      message: `Billing completed for table ${tableNumber}`,
      orders: completedOrders,
      count: completedOrders.length
    });
  } catch (error) {
    console.error('Error completing table billing:', error);
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
      modifiedAt: new Date()
    };
    
    const existingItem = order.items.find(i => i.id === newItem.id);
    if (existingItem) {
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
    
    const itemIndex = order.items.findIndex(i => i.id === req.params.itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
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
    item.quantity = quantity;
    item.isModified = true;
    item.modifiedAt = new Date();
    item.oldQuantity = oldQuantity;
    
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
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process credit sale
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
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error processing credit sale:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
