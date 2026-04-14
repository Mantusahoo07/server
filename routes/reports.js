import express from 'express';
import Order from '../models/Order.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin', 'manager'));

// Sales report
router.get('/sales', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = { status: 'completed' };
    
    if (startDate && endDate) {
      match.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const sales = await Order.aggregate([
      { $match: match },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        totalSales: { $sum: '$total' },
        orderCount: { $sum: 1 },
        avgOrderValue: { $avg: '$total' }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Top items report
router.get('/top-items', async (req, res) => {
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
});

// Staff performance report
router.get('/staff-performance', async (req, res) => {
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
});

export default router;
