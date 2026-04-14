import Order from '../models/Order.js';

export const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const match = { status: 'completed' };
    
    if (startDate && endDate) {
      match.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    let groupFormat;
    switch(groupBy) {
      case 'hour':
        groupFormat = { $hour: '$createdAt' };
        break;
      case 'day':
        groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        break;
      case 'month':
        groupFormat = { $month: '$createdAt' };
        break;
      default:
        groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }
    
    const salesData = await Order.aggregate([
      { $match: match },
      { $group: {
        _id: groupFormat,
        totalSales: { $sum: '$total' },
        orderCount: { $sum: 1 },
        averageOrderValue: { $avg: '$total' }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    res.json(salesData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTopItems = async (req, res) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;
    const match = { status: 'completed' };
    
    if (startDate && endDate) {
      match.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const topItems = await Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.name',
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
      }},
      { $sort: { totalQuantity: -1 } },
      { $limit: parseInt(limit) }
    ]);
    
    res.json(topItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getStaffPerformance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = { status: 'completed' };
    
    if (startDate && endDate) {
      match.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const performance = await Order.aggregate([
      { $match: match },
      { $group: {
        _id: '$createdBy',
        ordersProcessed: { $sum: 1 },
        totalRevenue: { $sum: '$total' },
        averageOrderValue: { $avg: '$total' }
      }},
      { $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'staff'
      }},
      { $unwind: { path: '$staff', preserveNullAndEmptyArrays: true } },
      { $project: {
        staffName: '$staff.username',
        staffRole: '$staff.role',
        ordersProcessed: 1,
        totalRevenue: 1,
        averageOrderValue: 1
      }}
    ]);
    
    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getOrderTypeDistribution = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};
    
    if (startDate && endDate) {
      match.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const distribution = await Order.aggregate([
      { $match: match },
      { $group: {
        _id: '$orderType',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$total' }
      }}
    ]);
    
    res.json(distribution);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getPaymentMethodDistribution = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = { status: 'completed' };
    
    if (startDate && endDate) {
      match.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const distribution = await Order.aggregate([
      { $match: match },
      { $group: {
        _id: '$payment.method',
        count: { $sum: 1 },
        totalAmount: { $sum: '$total' }
      }}
    ]);
    
    res.json(distribution);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};