import Order from '../models/Order.js';
import MenuItem from '../models/MenuItem.js';
import { Inventory } from '../models/Inventory.js';

export const createOrder = async (req, res) => {
  try {
    const orderData = req.body;
    
    // Generate order number
    const lastOrder = await Order.findOne().sort({ orderNumber: -1 });
    const orderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1001;
    
    const order = new Order({
      ...orderData,
      orderNumber,
      createdBy: req.userId,
      timerStart: new Date()
    });
    
    await order.save();
    
    // Update inventory for items
    for (const item of order.items) {
      const menuItem = await MenuItem.findById(item.id);
      if (menuItem && menuItem.availableQuantity > 0) {
        menuItem.availableQuantity -= item.quantity;
        await menuItem.save();
      }
    }
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getOrders = async (req, res) => {
  try {
    const { status, startDate, endDate, limit = 50 } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('createdBy', 'username');
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('createdBy', 'username')
      .populate('acceptedBy', 'username');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.status = status;
    
    if (status === 'accepted') {
      order.acceptedBy = req.userId;
    } else if (status === 'completed') {
      order.completedBy = req.userId;
    }
    
    await order.save();
    
    // Emit socket event for real-time update
    if (req.io) {
      req.io.emit('order-updated', order);
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateOrderItemStatus = async (req, res) => {
  try {
    const { itemId, status } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    item.status = status;
    if (status === 'completed') {
      item.completedAt = new Date();
    }
    
    // Check if all items are completed
    const allCompleted = order.items.every(i => i.status === 'completed');
    if (allCompleted) {
      order.status = 'completed';
      order.completedBy = req.userId;
    }
    
    await order.save();
    
    if (req.io) {
      req.io.emit('order-item-updated', { orderId: order._id, itemId, status });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getDailySales = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const orders = await Order.find({
      createdAt: { $gte: today },
      status: 'completed'
    });
    
    const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    
    // Get hourly breakdown
    const hourlySales = Array(24).fill(0);
    orders.forEach(order => {
      const hour = new Date(order.createdAt).getHours();
      hourlySales[hour] += order.total;
    });
    
    res.json({
      date: today,
      totalSales,
      totalOrders,
      averageOrderValue,
      hourlySales,
      orders
    });
  } catch (error) {
    console.error('Error getting daily sales:', error);
    res.status(500).json({ error: error.message });
  }
};

// CREDIT LEDGER - Get all credit due orders for a customer
export const getCreditLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const orders = await Order.find({
      'payment.method': 'credit',
      'payment.status': 'credit_due',
      $or: [
        { 'payment.customerId': customerId },
        { 'payment.customerName': { $regex: customerId, $options: 'i' } },
        { 'customer.name': { $regex: customerId, $options: 'i' } }
      ],
      status: { $ne: 'cancelled' }
    }).sort({ createdAt: -1 });
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching credit ledger:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET ALL CREDIT CUSTOMERS WITH TOTAL DUE - For Credit Ledger Modal
export const getCreditCustomers = async (req, res) => {
  try {
    const creditOrders = await Order.find({
      'payment.method': 'credit',
      'payment.status': 'credit_due',
      status: { $ne: 'cancelled' }
    }).sort({ createdAt: -1 });
    
    const customersMap = new Map();
    
    creditOrders.forEach(order => {
      // Get customer name from various sources
      let customerName = null;
      let customerPhone = null;
      let customerId = null;
      
      if (order.customer && order.customer.name) {
        customerName = order.customer.name;
        customerPhone = order.customer.phone || '';
        customerId = order.customer._id || order.customer.name;
      } else if (order.payment && order.payment.customerName) {
        customerName = order.payment.customerName;
        customerPhone = order.payment.customerPhone || '';
        customerId = order.payment.customerId || customerName;
      }
      
      // Skip if no customer name or it's a generic name
      if (!customerName || customerName === 'Walk-In' || customerName === 'Unknown Customer') {
        return;
      }
      
      const key = customerId || customerName;
      
      if (!customersMap.has(key)) {
        customersMap.set(key, {
          customerId: key,
          customerName: customerName,
          customerPhone: customerPhone,
          totalDue: 0,
          orders: []
        });
      }
      
      const customer = customersMap.get(key);
      customer.totalDue += order.total || 0;
      customer.orders.push({
        _id: order._id,
        orderNumber: order.orderNumber,
        displayOrderNumber: order.displayOrderNumber,
        total: order.total,
        createdAt: order.createdAt,
        dueDate: order.payment?.dueDate,
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        serviceCharge: order.serviceCharge,
        customerName: customerName,
        customerPhone: customerPhone,
        orderType: order.orderType,
        tableNumber: order.tableNumber
      });
    });
    
    res.json(Array.from(customersMap.values()));
  } catch (error) {
    console.error('Error fetching credit customers:', error);
    res.status(500).json({ error: error.message });
  }
};

// PROCESS CREDIT COLLECTION - Partial payment collection
export const processCreditCollection = async (req, res) => {
  try {
    const { customerId, amount, paymentMethod, note, collectedBy } = req.body;
    
    if (!customerId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
    // Find all credit orders for this customer that are still due
    const creditOrders = await Order.find({
      $or: [
        { 'customer.name': customerId },
        { 'customer._id': customerId },
        { 'payment.customerName': customerId },
        { 'payment.customerId': customerId }
      ],
      'payment.method': 'credit',
      'payment.status': 'credit_due',
      status: { $ne: 'cancelled' }
    }).sort({ createdAt: 1 });
    
    let remainingAmount = amount;
    const updatedOrders = [];
    
    for (const order of creditOrders) {
      if (remainingAmount <= 0) break;
      
      const orderDue = order.total;
      
      if (remainingAmount >= orderDue) {
        // Full payment for this order
        order.payment.status = 'paid';
        order.payment.collectedAt = new Date();
        order.payment.collectedAmount = orderDue;
        order.payment.collectionMethod = paymentMethod;
        order.payment.collectionNote = note;
        order.status = 'completed';
        order.completedAt = new Date();
        remainingAmount -= orderDue;
        updatedOrders.push({ 
          orderId: order._id, 
          orderNumber: order.displayOrderNumber || order.orderNumber,
          amount: orderDue, 
          status: 'fully_paid' 
        });
      } else {
        // Partial payment - update order total
        const newTotal = orderDue - remainingAmount;
        
        // Create a record of partial payment
        if (!order.payment.partialPayments) {
          order.payment.partialPayments = [];
        }
        order.payment.partialPayments.push({
          amount: remainingAmount,
          method: paymentMethod,
          note: note,
          collectedAt: new Date(),
          collectedBy: collectedBy
        });
        
        order.total = newTotal;
        order.subtotal = newTotal - (order.tax + order.serviceCharge);
        order.payment.amount = newTotal;
        order.payment.remainingDue = newTotal;
        
        updatedOrders.push({ 
          orderId: order._id, 
          orderNumber: order.displayOrderNumber || order.orderNumber,
          amount: remainingAmount, 
          status: 'partial_paid', 
          remainingDue: newTotal 
        });
        remainingAmount = 0;
      }
      
      await order.save();
    }
    
    const io = req.app?.get('io');
    if (io) {
      io.emit('credit-collection-updated', { customerId, amount, updatedOrders });
    }
    
    res.json({
      success: true,
      message: `Collected ₹${amount}`,
      updatedOrders,
      remainingAmount
    });
  } catch (error) {
    console.error('Error processing credit collection:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update payment method for an order
export const updatePaymentMethod = async (req, res) => {
  try {
    const { paymentMethod, reason } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const validMethods = ['cash', 'card', 'upi', 'credit'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    
    const oldMethod = order.payment?.method || 'pending';
    
    order.payment = {
      ...order.payment,
      method: paymentMethod,
      status: paymentMethod === 'credit' ? 'credit_due' : 'paid',
      timestamp: new Date(),
      notes: order.payment?.notes 
        ? `${order.payment.notes}\nPayment method changed from ${oldMethod} to ${paymentMethod}. Reason: ${reason || 'Manual correction'}`
        : `Payment method changed from ${oldMethod} to ${paymentMethod}. Reason: ${reason || 'Manual correction'}`
    };
    
    order.updatedAt = new Date();
    await order.save();
    
    const io = req.app?.get('io');
    if (io) {
      io.emit('order-updated', order);
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update order details (type, table, platform)
export const updateOrder = async (req, res) => {
  try {
    const { orderType, tableNumber, deliveryPlatform } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (orderType && orderType !== order.orderType) {
      order.orderType = orderType;
      
      if (orderType === 'dine-in') {
        if (tableNumber !== undefined) {
          order.tableNumber = parseInt(tableNumber);
        }
        order.deliveryPlatform = null;
      } else if (orderType === 'takeaway') {
        order.tableNumber = null;
        order.deliveryPlatform = null;
      } else if (orderType === 'delivery') {
        order.tableNumber = null;
        if (deliveryPlatform) {
          order.deliveryPlatform = deliveryPlatform;
        }
      }
    } else {
      if (tableNumber !== undefined && order.orderType === 'dine-in') {
        order.tableNumber = parseInt(tableNumber);
      }
      if (deliveryPlatform !== undefined && order.orderType === 'delivery') {
        order.deliveryPlatform = deliveryPlatform;
      }
    }
    
    order.updatedAt = new Date();
    await order.save();
    
    const io = req.app?.get('io');
    if (io) {
      io.emit('order-updated', order);
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: error.message });
  }
};

// Complete payment for order
export const completePayment = async (req, res) => {
  try {
    const { paymentMethod, paymentDetails, status, completedAt } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (paymentMethod === 'split' && paymentDetails.splitDetails && paymentDetails.splitDetails.length > 0) {
      const splitDetails = paymentDetails.splitDetails;
      const totalAmount = paymentDetails.amount;
      
      const splitRecords = splitDetails.map(p => ({
        method: p.method,
        amount: p.amount,
        transactionId: paymentDetails.transactionId,
        timestamp: new Date()
      }));
      
      order.payment = {
        method: 'split',
        status: 'paid',
        amount: totalAmount,
        transactionId: paymentDetails.transactionId,
        timestamp: new Date(),
        splitDetails: splitRecords,
        note: `Split payment: ${splitRecords.map(s => `${s.method.toUpperCase()}: ₹${s.amount}`).join(', ')}`
      };
    } else if (paymentMethod === 'credit') {
      order.payment = {
        method: 'credit',
        status: 'credit_due',
        amount: paymentDetails.amount,
        transactionId: paymentDetails.transactionId || `CREDIT_${Date.now()}`,
        timestamp: new Date(),
        dueDate: paymentDetails.dueDate,
        customerName: paymentDetails.customerName,
        customerPhone: paymentDetails.customerPhone,
        customerId: paymentDetails.customerId,
        notes: paymentDetails.notes
      };
    } else {
      order.payment = {
        method: paymentMethod,
        status: 'paid',
        amount: paymentDetails.amount,
        transactionId: paymentDetails.transactionId || `${paymentMethod.toUpperCase()}_${Date.now()}`,
        timestamp: new Date(),
        gatewayCharges: paymentDetails.gatewayCharges || 0,
        change: paymentDetails.change || 0
      };
    }
    
    if (status) order.status = status;
    if (completedAt) order.completedAt = new Date(completedAt);
    order.completedBy = req.userId;
    order.updatedAt = new Date();
    
    await order.save();
    
    const io = req.app?.get('io');
    if (io) {
      io.emit('order-updated', order);
      if (status === 'completed') io.emit('order-completed', order._id);
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({ error: error.message });
  }
};
