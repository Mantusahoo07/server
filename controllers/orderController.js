import Order from '../models/Order.js';
import Table from '../models/Table.js';

const generateTableSessionId = (tableNumber) => {
  return `table_${tableNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const createOrder = async (req, res) => {
  try {
    const orderData = req.body;
    
    let baseOrderNumber, runningNumber, tableSessionId;
    let isAdditionalOrder = false;
    
    if (orderData.orderType === 'dine-in' && orderData.tableNumber) {
      let table = await Table.findOne({ tableNumber: orderData.tableNumber });
      
      if (!table) {
        table = new Table({ tableNumber: orderData.tableNumber });
        await table.save();
      }
      
      if (table.status === 'running' && table.currentSessionId && table.baseOrderNumber) {
        tableSessionId = table.currentSessionId;
        isAdditionalOrder = true;
        baseOrderNumber = table.baseOrderNumber;
        runningNumber = table.runningOrderCount + 1;
      } else {
        tableSessionId = generateTableSessionId(orderData.tableNumber);
        isAdditionalOrder = false;
        runningNumber = 0;
        
        const lastOrder = await Order.findOne().sort({ baseOrderNumber: -1 });
        baseOrderNumber = lastOrder ? lastOrder.baseOrderNumber + 1 : 1000000;
        
        table.currentSessionId = tableSessionId;
        table.baseOrderNumber = baseOrderNumber;
        table.status = 'running';
        table.runningOrderCount = 1;
        await table.save();
      }
    } else {
      const lastOrder = await Order.findOne().sort({ baseOrderNumber: -1 });
      baseOrderNumber = lastOrder ? lastOrder.baseOrderNumber + 1 : 1000000;
      runningNumber = 0;
    }
    
    const order = new Order({
      ...orderData,
      baseOrderNumber,
      runningNumber,
      tableSessionId,
      isAdditionalOrder,
      createdBy: req.userId
    });
    
    const savedOrder = await order.save();
    
    if (orderData.orderType === 'dine-in' && orderData.tableNumber && isAdditionalOrder) {
      await Table.findOneAndUpdate(
        { tableNumber: orderData.tableNumber },
        { $inc: { runningOrderCount: 1 } }
      );
    }
    
    const io = req.app.get('io');
    if (io) {
      io.emit('new-order-received', savedOrder);
      io.emit('order-updated', savedOrder);
    }
    
    res.status(201).json(savedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getOrders = async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    order.status = status;
    if (status === 'accepted') order.acceptedBy = req.userId;
    if (status === 'completed') order.completedAt = new Date();
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('order-updated', order);
      if (status === 'accepted') io.emit('order-accepted', order._id);
      if (status === 'ready_for_billing') io.emit('order-ready-for-billing', order._id);
      if (status === 'completed') io.emit('order-completed', order._id);
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addItemToOrder = async (req, res) => {
  try {
    const { item } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const existingItem = order.items.find(i => i.id === item.id);
    if (existingItem) {
      existingItem.quantity += item.quantity;
      existingItem.isModified = true;
      existingItem.modifiedAt = new Date();
    } else {
      order.items.push({
        ...item,
        status: 'pending',
        isModified: true,
        modifiedAt: new Date()
      });
    }
    
    await order.save();
    
    const io = req.app.get('io');
    if (io) io.emit('order-updated', order);
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const removeItemFromOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    order.items = order.items.filter(i => i.id !== req.params.itemId);
    await order.save();
    
    const io = req.app.get('io');
    if (io) io.emit('order-updated', order);
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateItemQuantity = async (req, res) => {
  try {
    const { quantity } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const item = order.items.find(i => i.id === req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    item.quantity = quantity;
    item.isModified = true;
    item.modifiedAt = new Date();
    await order.save();
    
    const io = req.app.get('io');
    if (io) io.emit('order-updated', order);
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const completePayment = async (req, res) => {
  try {
    const { paymentMethod, paymentDetails, status } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
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
    if (status === 'completed') order.completedAt = new Date();
    await order.save();
    
    const io = req.app.get('io');
    if (io) io.emit('order-updated', order);
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const requestCancellation = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const item = order.items.find(i => i.id === req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    item.cancellationRequested = true;
    item.cancellationRequestedAt = new Date();
    item.cancellationReason = reason || 'No reason provided';
    item.status = 'cancellation_requested';
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('cancellation-requested', {
        orderId: order._id,
        itemId: item.id,
        itemName: item.name,
        quantity: item.quantity,
        reason: item.cancellationReason,
        orderNumber: order.displayOrderNumber || order.orderNumber,
        tableNumber: order.tableNumber,
        orderType: order.orderType
      });
    }
    
    res.json({ message: 'Cancellation request sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const approveCancellation = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const itemIndex = order.items.findIndex(i => i.id === req.params.itemId);
    if (itemIndex === -1) return res.status(404).json({ error: 'Item not found' });
    
    order.items.splice(itemIndex, 1);
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('cancellation-approved', {
        orderId: order._id,
        orderNumber: order.displayOrderNumber || order.orderNumber
      });
    }
    
    res.json({ message: 'Cancellation approved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const rejectCancellation = async (req, res) => {
  try {
    const { rejectReason } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const item = order.items.find(i => i.id === req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    
    item.cancellationRequested = false;
    item.cancellationRequestedAt = null;
    item.cancellationReason = '';
    item.status = 'pending';
    await order.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('cancellation-rejected', {
        orderId: order._id,
        itemId: item.id,
        itemName: item.name,
        rejectReason: rejectReason || 'No reason provided',
        orderNumber: order.displayOrderNumber || order.orderNumber
      });
    }
    
    res.json({ message: 'Cancellation rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const completeTableBilling = async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    
    await Order.updateMany(
      { tableNumber, status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] } },
      { status: 'completed', completedAt: new Date(), 'payment.status': 'paid' }
    );
    
    await Table.findOneAndUpdate(
      { tableNumber },
      { status: 'available', currentSessionId: null, baseOrderNumber: null, runningOrderCount: 0 }
    );
    
    const io = req.app.get('io');
    if (io) {
      io.emit('table-status-changed', { tableNumber, status: 'available', runningOrderCount: 0 });
    }
    
    res.json({ message: `Billing completed for table ${tableNumber}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getPendingCancellations = async (req, res) => {
  try {
    const orders = await Order.find({
      'items.cancellationRequested': true,
      'items.cancellationApproved': false
    });
    
    const pendingRequests = [];
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.cancellationRequested && !item.cancellationApproved) {
          pendingRequests.push({
            orderId: order._id,
            orderNumber: order.displayOrderNumber || order.orderNumber,
            itemId: item.id,
            itemName: item.name,
            quantity: item.quantity,
            reason: item.cancellationReason,
            requestedAt: item.cancellationRequestedAt,
            tableNumber: order.tableNumber,
            orderType: order.orderType,
            deliveryPlatform: order.deliveryPlatform
          });
        }
      });
    });
    
    res.json(pendingRequests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTableActiveOrders = async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    const activeOrders = await Order.find({
      tableNumber,
      status: { $in: ['pending', 'accepted', 'preparing', 'hold', 'ready_for_billing'] }
    }).sort({ runningNumber: 1 });
    
    res.json(activeOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};