import express from 'express';
import Order from '../models/Order.js';
import Customer from '../models/Customer.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

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
    const orderData = { ...req.body };
    
    if (orderData.orderType !== 'delivery') {
      delete orderData.deliveryPlatform;
    }
    
    const order = new Order(orderData);
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      console.log('📡 New order:', order.orderNumber);
      io.emit('new-order-received', order);
      io.emit('order-updated', order);
    }
    
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
router.post('/:id/credit-sale', authenticate, authorize('admin', 'manager', 'cashier'), async (req, res) => {
  try {
    const { customerId, customerName, customerPhone, customerEmail, dueDate } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Find or create customer
    let customer = null;
    if (customerId) {
      customer = await Customer.findById(customerId);
    } else if (customerPhone) {
      customer = await Customer.findOne({ phone: customerPhone });
    }
    
    if (!customer && customerName && customerPhone) {
      customer = new Customer({
        name: customerName,
        phone: customerPhone,
        email: customerEmail || '',
        creditLimit: 0,
        outstandingAmount: order.total
      });
      await customer.save();
    } else if (customer) {
      customer.outstandingAmount = (customer.outstandingAmount || 0) + order.total;
      customer.totalPurchases = (customer.totalPurchases || 0) + order.total;
      customer.lastPurchaseDate = new Date();
      await customer.save();
    }
    
    order.payment = {
      method: 'credit',
      status: 'credit_due',
      amount: order.total,
      transactionId: `CREDIT_${Date.now()}`,
      timestamp: new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      customerName: customer?.name || customerName,
      customerPhone: customer?.phone || customerPhone
    };
    
    order.status = 'completed';
    order.completedAt = new Date();
    order.completedBy = req.userId;
    order.customer = {
      name: customer?.name || customerName,
      phone: customer?.phone || customerPhone,
      email: customer?.email || customerEmail
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
