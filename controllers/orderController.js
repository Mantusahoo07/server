import Order from '../models/Order.js';
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
    req.io.emit('order-updated', order);
    
    res.json(order);
  } catch (error) {
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
    
    req.io.emit('order-item-updated', { orderId: order._id, itemId, status });
    
    res.json(order);
  } catch (error) {
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
    res.status(500).json({ error: error.message });
  }
};