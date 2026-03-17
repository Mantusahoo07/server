const Order = require('../models/Order');
const { MenuItem } = require('../models/Menu');
const { Customer } = require('../models/Customer');
const { Ingredient } = require('../models/Inventory');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

exports.getOrders = catchAsync(async (req, res) => {
  const {
    status,
    type,
    startDate,
    endDate,
    page = 1,
    limit = 20,
    sort = '-timing.orderedAt',
    locationId
  } = req.query;

  const query = { locationId: locationId || req.user.location };

  if (status) query.orderStatus = status;
  if (type) query.orderType = type;
  if (startDate || endDate) {
    query['timing.orderedAt'] = {};
    if (startDate) query['timing.orderedAt'].$gte = new Date(startDate);
    if (endDate) query['timing.orderedAt'].$lte = new Date(endDate);
  }

  const options = {
    skip: (page - 1) * limit,
    limit: parseInt(limit),
    sort,
    populate: [
      { path: 'customerId', select: 'name phone' },
      { path: 'serverId', select: 'name' }
    ]
  };

  const orders = await Order.find(query, null, options);
  const total = await Order.countDocuments(query);

  res.json({
    success: true,
    data: orders,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

exports.getOrderById = catchAsync(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('customerId')
    .populate('serverId')
    .populate('items.menuItemId');

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  res.json({
    success: true,
    data: order
  });
});

exports.createOrder = catchAsync(async (req, res) => {
  const orderData = {
    ...req.body,
    locationId: req.body.locationId || req.user.location,
    createdBy: req.user._id,
    serverId: req.body.serverId || req.user.employeeId
  };

  // Generate order number
  const date = new Date();
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  const count = await Order.countDocuments({
    locationId: orderData.locationId,
    'timing.orderedAt': {
      $gte: new Date(date.setHours(0, 0, 0, 0)),
      $lt: new Date(date.setHours(23, 59, 59, 999))
    }
  });
  
  orderData.orderNumber = `ORD-${year}${month}${day}-${(count + 1).toString().padStart(4, '0')}`;

  // Create order
  const order = new Order(orderData);
  await order.save();

  // Update inventory
  for (const item of order.items) {
    // Find recipe and update inventory
    const menuItem = await MenuItem.findById(item.menuItemId).populate('ingredients.ingredientId');
    if (menuItem?.ingredients) {
      for (const ingredient of menuItem.ingredients) {
        await Ingredient.findByIdAndUpdate(
          ingredient.ingredientId,
          { $inc: { quantity: -ingredient.quantity * item.quantity } }
        );
      }
    }
  }

  // Update customer loyalty
  if (order.customerId) {
    const customer = await Customer.findById(order.customerId);
    if (customer) {
      await customer.addLoyaltyPoints(Math.floor(order.total));
      customer.statistics.totalOrders += 1;
      customer.statistics.totalSpent += order.total;
      customer.statistics.averageOrderValue = customer.statistics.totalSpent / customer.statistics.totalOrders;
      customer.statistics.lastVisit = new Date();
      await customer.save();
    }
  }

  // Emit socket event
  req.app.get('io').to(`location:${order.locationId}`).emit('order:created', order);

  logger.audit('ORDER_CREATED', req.user._id, {
    orderId: order._id,
    orderNumber: order.orderNumber,
    total: order.total
  });

  res.status(201).json({
    success: true,
    data: order
  });
});

exports.updateOrder = catchAsync(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  // Check if order can be updated
  if (order.orderStatus === 'completed' || order.orderStatus === 'cancelled') {
    throw new AppError('Cannot update completed or cancelled orders', 400);
  }

  // Update allowed fields
  const allowedUpdates = ['items', 'notes', 'specialRequests', 'discount'];
  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      order[field] = req.body[field];
    }
  });

  order.calculateTotals();
  order.updatedBy = req.user._id;
  await order.save();

  // Emit socket event
  req.app.get('io').to(`location:${order.locationId}`).emit('order:updated', order);

  logger.audit('ORDER_UPDATED', req.user._id, {
    orderId: order._id,
    changes: req.body
  });

  res.json({
    success: true,
    data: order
  });
});

exports.updateOrderStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const order = await Order.findById(req.params.id);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  order.orderStatus = status;
  order.timing[`${status}At`] = new Date();
  order.updatedBy = req.user._id;

  if (status === 'preparing') {
    order.kitchenStatus = 'preparing';
    order.timing.preparingAt = new Date();
  } else if (status === 'ready') {
    order.kitchenStatus = 'ready';
    order.timing.readyAt = new Date();
  } else if (status === 'completed') {
    order.timing.completedAt = new Date();
  } else if (status === 'cancelled') {
    order.timing.cancelledAt = new Date();
  }

  await order.save();

  // Emit socket event
  req.app.get('io').to(`location:${order.locationId}`).emit('order:status-updated', {
    orderId: order._id,
    status
  });

  logger.audit('ORDER_STATUS_UPDATED', req.user._id, {
    orderId: order._id,
    status
  });

  res.json({
    success: true,
    data: order
  });
});

exports.updateItemStatus = catchAsync(async (req, res) => {
  const { orderId, itemId } = req.params;
  const { status } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const item = order.items.id(itemId);
  if (!item) {
    throw new AppError('Item not found', 404);
  }

  item.status = status;
  if (status === 'preparing') {
    item.startedAt = new Date();
  } else if (status === 'ready') {
    item.completedAt = new Date();
  }

  await order.save();

  // Check if all items are ready
  const allItemsReady = order.items.every(i => i.status === 'ready');
  if (allItemsReady && order.kitchenStatus !== 'ready') {
    order.kitchenStatus = 'ready';
    order.timing.readyAt = new Date();
    await order.save();
  }

  // Emit socket event
  req.app.get('io').to(`location:${order.locationId}`).emit('kitchen:item-updated', {
    orderId: order._id,
    itemId,
    status
  });

  res.json({
    success: true,
    data: order
  });
});

exports.getKitchenOrders = catchAsync(async (req, res) => {
  const { locationId, station } = req.query;

  const orders = await Order.getKitchenOrders(locationId || req.user.location, station);

  res.json({
    success: true,
    data: orders
  });
});

exports.addPayment = catchAsync(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  if (order.paymentStatus === 'paid') {
    throw new AppError('Order is already paid', 400);
  }

  const payment = {
    ...req.body,
    processedBy: req.user._id,
    processedAt: new Date(),
    status: 'completed'
  };

  order.payments.push(payment);
  order.updatePaymentStatus();

  await order.save();

  // Emit socket event
  req.app.get('io').to(`location:${order.locationId}`).emit('order:payment-added', {
    orderId: order._id,
    payment
  });

  logger.audit('PAYMENT_ADDED', req.user._id, {
    orderId: order._id,
    amount: payment.amount,
    method: payment.method
  });

  res.json({
    success: true,
    data: order
  });
});

exports.processRefund = catchAsync(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  if (order.paymentStatus !== 'paid') {
    throw new AppError('Order is not paid', 400);
  }

  // Process refund logic here
  order.paymentStatus = 'refunded';
  order.orderStatus = 'cancelled';
  order.timing.cancelledAt = new Date();
  await order.save();

  logger.audit('REFUND_PROCESSED', req.user._id, {
    orderId: order._id,
    amount: req.body.amount,
    reason: req.body.reason
  });

  res.json({
    success: true,
    message: 'Refund processed successfully'
  });
});

exports.getOrderStats = catchAsync(async (req, res) => {
  const { locationId, timeRange } = req.query;
  const location = locationId || req.user.location;

  const now = new Date();
  let startDate;

  switch (timeRange) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - now.getDay()));
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      startDate = new Date(now.setHours(0, 0, 0, 0));
  }

  const stats = await Order.aggregate([
    {
      $match: {
        locationId: mongoose.Types.ObjectId(location),
        'timing.orderedAt': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$total' },
        totalOrders: { $sum: 1 },
        avgOrderValue: { $avg: '$total' }
      }
    }
  ]);

  // Get previous period for comparison
  const previousStart = new Date(startDate);
  previousStart.setDate(previousStart.getDate() - (now - startDate) / (1000 * 60 * 60 * 24));

  const previousStats = await Order.aggregate([
    {
      $match: {
        locationId: mongoose.Types.ObjectId(location),
        'timing.orderedAt': {
          $gte: previousStart,
          $lt: startDate
        }
      }
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$total' },
        totalOrders: { $sum: 1 }
      }
    }
  ]);

  const current = stats[0] || { totalSales: 0, totalOrders: 0, avgOrderValue: 0 };
  const previous = previousStats[0] || { totalSales: 0, totalOrders: 0 };

  res.json({
    success: true,
    data: {
      totalSales: current.totalSales,
      totalOrders: current.totalOrders,
      avgOrderValue: current.avgOrderValue,
      salesChange: previous.totalSales ? ((current.totalSales - previous.totalSales) / previous.totalSales) * 100 : 0,
      ordersChange: previous.totalOrders ? ((current.totalOrders - previous.totalOrders) / previous.totalOrders) * 100 : 0
    }
  });
});

exports.getDailySummary = catchAsync(async (req, res) => {
  const { date, locationId } = req.query;
  const summary = await Order.getDailySummary(locationId || req.user.location, date || new Date());

  res.json({
    success: true,
    data: summary
  });
});