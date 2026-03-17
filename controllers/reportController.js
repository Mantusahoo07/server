const Order = require('../models/Order');
const { Ingredient, InventoryTransaction } = require('../models/Inventory');
const { Customer } = require('../models/Customer');
const Employee = require('../models/Employee');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// @desc    Get sales report
// @route   GET /api/reports/sales
// @access  Private
exports.getSalesReport = catchAsync(async (req, res) => {
  const { 
    startDate, 
    endDate, 
    groupBy = 'day',
    locationId 
  } = req.query;

  const matchStage = {
    locationId: mongoose.Types.ObjectId(locationId || req.user.location),
    paymentStatus: 'paid'
  };

  if (startDate || endDate) {
    matchStage['timing.orderedAt'] = {};
    if (startDate) matchStage['timing.orderedAt'].$gte = new Date(startDate);
    if (endDate) matchStage['timing.orderedAt'].$lte = new Date(endDate);
  }

  let groupStage = {};
  
  switch (groupBy) {
    case 'hour':
      groupStage = {
        year: { $year: '$timing.orderedAt' },
        month: { $month: '$timing.orderedAt' },
        day: { $dayOfMonth: '$timing.orderedAt' },
        hour: { $hour: '$timing.orderedAt' }
      };
      break;
    case 'day':
      groupStage = {
        year: { $year: '$timing.orderedAt' },
        month: { $month: '$timing.orderedAt' },
        day: { $dayOfMonth: '$timing.orderedAt' }
      };
      break;
    case 'month':
      groupStage = {
        year: { $year: '$timing.orderedAt' },
        month: { $month: '$timing.orderedAt' }
      };
      break;
    case 'year':
      groupStage = {
        year: { $year: '$timing.orderedAt' }
      };
      break;
  }

  const salesData = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: groupStage,
        totalSales: { $sum: '$total' },
        totalOrders: { $sum: 1 },
        averageOrderValue: { $avg: '$total' },
        totalTax: { $sum: '$tax' },
        totalDiscount: { $sum: { $ifNull: ['$discount.amount', 0] } }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
  ]);

  // Get category breakdown
  const categoryData = await Order.aggregate([
    { $match: matchStage },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.category',
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        totalQuantity: { $sum: '$items.quantity' }
      }
    },
    { $sort: { totalRevenue: -1 } }
  ]);

  // Get payment method breakdown
  const paymentData = await Order.aggregate([
    { $match: matchStage },
    { $unwind: '$payments' },
    {
      $group: {
        _id: '$payments.method',
        totalAmount: { $sum: '$payments.amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      sales: salesData,
      byCategory: categoryData,
      byPaymentMethod: paymentData,
      summary: {
        totalSales: salesData.reduce((sum, item) => sum + item.totalSales, 0),
        totalOrders: salesData.reduce((sum, item) => sum + item.totalOrders, 0),
        averageOrderValue: salesData.length ? 
          salesData.reduce((sum, item) => sum + item.totalSales, 0) / 
          salesData.reduce((sum, item) => sum + item.totalOrders, 0) : 0
      }
    }
  });
});

// @desc    Get daily sales
// @route   GET /api/reports/sales/daily
// @access  Private
exports.getDailySales = catchAsync(async (req, res) => {
  const { date, locationId } = req.query;
  const targetDate = date ? new Date(date) : new Date();
  
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const orders = await Order.find({
    locationId: locationId || req.user.location,
    'timing.orderedAt': { $gte: startOfDay, $lte: endOfDay },
    paymentStatus: 'paid'
  }).populate('items.menuItemId');

  // Group by hour
  const hourlyData = {};
  for (let i = 0; i < 24; i++) {
    hourlyData[i] = { orders: 0, revenue: 0 };
  }

  orders.forEach(order => {
    const hour = new Date(order.timing.orderedAt).getHours();
    hourlyData[hour].orders += 1;
    hourlyData[hour].revenue += order.total;
  });

  res.json({
    success: true,
    data: {
      date: targetDate,
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
      averageOrderValue: orders.length ? 
        orders.reduce((sum, o) => sum + o.total, 0) / orders.length : 0,
      hourlyData: Object.entries(hourlyData).map(([hour, data]) => ({
        hour: parseInt(hour),
        ...data
      }))
    }
  });
});

// @desc    Get hourly sales
// @route   GET /api/reports/sales/hourly
// @access  Private
exports.getHourlySales = catchAsync(async (req, res) => {
  const { date, locationId } = req.query;
  const targetDate = date ? new Date(date) : new Date();
  
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const data = await Order.aggregate([
    {
      $match: {
        locationId: mongoose.Types.ObjectId(locationId || req.user.location),
        'timing.orderedAt': { $gte: startOfDay, $lte: endOfDay },
        paymentStatus: 'paid'
      }
    },
    {
      $group: {
        _id: { $hour: '$timing.orderedAt' },
        orders: { $sum: 1 },
        revenue: { $sum: '$total' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  res.json({
    success: true,
    data
  });
});

// @desc    Get inventory report
// @route   GET /api/reports/inventory
// @access  Private
exports.getInventoryReport = catchAsync(async (req, res) => {
  const { locationId } = req.query;

  const inventory = await Ingredient.find({ 
    locationId: locationId || req.user.location 
  }).populate('supplierInfo.primarySupplier', 'name');

  const summary = {
    totalItems: inventory.length,
    totalValue: inventory.reduce((sum, item) => 
      sum + (item.quantity * (item.cost?.current || 0)), 0),
    lowStock: inventory.filter(item => item.quantity <= item.minQuantity).length,
    outOfStock: inventory.filter(item => item.quantity === 0).length
  };

  // Get recent transactions
  const recentTransactions = await InventoryTransaction.find({
    locationId: locationId || req.user.location
  })
  .sort('-createdAt')
  .limit(100)
  .populate('ingredientId', 'name unit')
  .populate('performedBy', 'name');

  res.json({
    success: true,
    data: {
      summary,
      inventory,
      recentTransactions
    }
  });
});

// @desc    Get inventory valuation
// @route   GET /api/reports/inventory/valuation
// @access  Private
exports.getInventoryValuation = catchAsync(async (req, res) => {
  const { locationId } = req.query;

  const valuation = await Ingredient.aggregate([
    {
      $match: {
        locationId: mongoose.Types.ObjectId(locationId || req.user.location)
      }
    },
    {
      $group: {
        _id: '$category',
        totalItems: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        totalValue: { 
          $sum: { $multiply: ['$quantity', { $ifNull: ['$cost.current', 0] }] } 
        }
      }
    },
    { $sort: { totalValue: -1 } }
  ]);

  res.json({
    success: true,
    data: valuation
  });
});

// @desc    Get inventory movement
// @route   GET /api/reports/inventory/movement
// @access  Private
exports.getInventoryMovement = catchAsync(async (req, res) => {
  const { 
    startDate, 
    endDate, 
    ingredientId,
    locationId 
  } = req.query;

  const matchStage = {
    locationId: mongoose.Types.ObjectId(locationId || req.user.location)
  };

  if (ingredientId) matchStage.ingredientId = mongoose.Types.ObjectId(ingredientId);
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const movements = await InventoryTransaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          ingredientId: '$ingredientId',
          type: '$type',
          date: { 
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } 
          }
        },
        totalQuantity: { $sum: '$quantity' },
        totalCost: { $sum: '$totalCost' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': -1 } }
  ]);

  res.json({
    success: true,
    data: movements
  });
});

// @desc    Get employee report
// @route   GET /api/reports/employees
// @access  Private
exports.getEmployeeReport = catchAsync(async (req, res) => {
  const { startDate, endDate, locationId } = req.query;

  const matchStage = {
    locationId: mongoose.Types.ObjectId(locationId || req.user.location)
  };

  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const employees = await Employee.find(matchStage);

  // Get order statistics per employee
  const orderStats = await Order.aggregate([
    {
      $match: {
        locationId: mongoose.Types.ObjectId(locationId || req.user.location),
        serverId: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$serverId',
        totalOrders: { $sum: 1 },
        totalSales: { $sum: '$total' },
        totalTips: { $sum: { $sum: '$payments.tip' } }
      }
    }
  ]);

  // Combine employee data with order stats
  const reportData = employees.map(emp => {
    const stats = orderStats.find(s => s._id.toString() === emp._id.toString()) || {};
    return {
      ...emp.toObject(),
      performance: stats
    };
  });

  res.json({
    success: true,
    data: reportData
  });
});

// @desc    Get employee performance
// @route   GET /api/reports/employees/performance
// @access  Private
exports.getEmployeePerformance = catchAsync(async (req, res) => {
  const { startDate, endDate, employeeId, locationId } = req.query;

  const matchStage = {
    locationId: mongoose.Types.ObjectId(locationId || req.user.location)
  };

  if (employeeId) matchStage.serverId = mongoose.Types.ObjectId(employeeId);
  if (startDate || endDate) {
    matchStage['timing.orderedAt'] = {};
    if (startDate) matchStage['timing.orderedAt'].$gte = new Date(startDate);
    if (endDate) matchStage['timing.orderedAt'].$lte = new Date(endDate);
  }

  const performance = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$serverId',
        totalOrders: { $sum: 1 },
        totalSales: { $sum: '$total' },
        averageOrderValue: { $avg: '$total' },
        totalTips: { $sum: { $sum: '$payments.tip' } },
        ordersByHour: {
          $push: { $hour: '$timing.orderedAt' }
        }
      }
    },
    {
      $lookup: {
        from: 'employees',
        localField: '_id',
        foreignField: '_id',
        as: 'employee'
      }
    },
    { $unwind: '$employee' }
  ]);

  res.json({
    success: true,
    data: performance
  });
});

// @desc    Get customer report
// @route   GET /api/reports/customers
// @access  Private
exports.getCustomerReport = catchAsync(async (req, res) => {
  const { startDate, endDate, locationId } = req.query;

  const matchStage = {
    locationId: mongoose.Types.ObjectId(locationId || req.user.location)
  };

  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const customers = await Customer.find(matchStage)
    .sort('-statistics.totalSpent');

  // Get order statistics per customer
  const orderStats = await Order.aggregate([
    {
      $match: {
        locationId: mongoose.Types.ObjectId(locationId || req.user.location),
        customerId: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$customerId',
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$total' }
      }
    }
  ]);

  // Combine customer data with order stats
  const reportData = customers.map(customer => {
    const stats = orderStats.find(s => s._id.toString() === customer._id.toString()) || {
      totalOrders: 0,
      totalSpent: 0
    };
    return {
      ...customer.toObject(),
      orderStats: stats
    };
  });

  res.json({
    success: true,
    data: reportData
  });
});

// @desc    Get loyalty report
// @route   GET /api/reports/customers/loyalty
// @access  Private
exports.getLoyaltyReport = catchAsync(async (req, res) => {
  const { locationId } = req.query;

  const loyaltyData = await Customer.aggregate([
    {
      $match: {
        locationId: mongoose.Types.ObjectId(locationId || req.user.location)
      }
    },
    {
      $group: {
        _id: '$loyalty.tier',
        count: { $sum: 1 },
        totalPoints: { $sum: '$loyalty.points' },
        averagePoints: { $avg: '$loyalty.points' },
        totalSpent: { $sum: '$statistics.totalSpent' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const recentRedemptions = await Customer.aggregate([
    {
      $match: {
        locationId: mongoose.Types.ObjectId(locationId || req.user.location),
        'loyalty.rewards': { $elemMatch: { used: true } }
      }
    },
    { $unwind: '$loyalty.rewards' },
    { $match: { 'loyalty.rewards.used': true } },
    { $sort: { 'loyalty.rewards.redeemedAt': -1 } },
    { $limit: 50 },
    {
      $project: {
        customerName: '$name',
        reward: '$loyalty.rewards'
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      tiers: loyaltyData,
      recentRedemptions
    }
  });
});

// @desc    Get financial report
// @route   GET /api/reports/financial
// @access  Private
exports.getFinancialReport = catchAsync(async (req, res) => {
  const { startDate, endDate, locationId } = req.query;

  const matchStage = {
    locationId: mongoose.Types.ObjectId(locationId || req.user.location),
    paymentStatus: 'paid'
  };

  if (startDate || endDate) {
    matchStage['timing.orderedAt'] = {};
    if (startDate) matchStage['timing.orderedAt'].$gte = new Date(startDate);
    if (endDate) matchStage['timing.orderedAt'].$lte = new Date(endDate);
  }

  const [revenue, expenses] = await Promise.all([
    // Revenue from orders
    Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalTax: { $sum: '$tax' },
          totalTips: { $sum: { $sum: '$payments.tip' } },
          totalDiscounts: { $sum: { $ifNull: ['$discount.amount', 0] } }
        }
      }
    ]),

    // Expenses from inventory purchases
    InventoryTransaction.aggregate([
      {
        $match: {
          locationId: mongoose.Types.ObjectId(locationId || req.user.location),
          type: 'purchase',
          createdAt: matchStage['timing.orderedAt']
        }
      },
      {
        $group: {
          _id: null,
          totalCost: { $sum: '$totalCost' }
        }
      }
    ])
  ]);

  const rev = revenue[0] || { totalRevenue: 0, totalTax: 0, totalTips: 0, totalDiscounts: 0 };
  const exp = expenses[0] || { totalCost: 0 };

  res.json({
    success: true,
    data: {
      revenue: rev.totalRevenue,
      expenses: exp.totalCost,
      grossProfit: rev.totalRevenue - exp.totalCost,
      tax: rev.totalTax,
      tips: rev.totalTips,
      discounts: rev.totalDiscounts,
      netProfit: rev.totalRevenue - exp.totalCost - rev.totalTax
    }
  });
});

// @desc    Get profit & loss report
// @route   GET /api/reports/financial/pnl
// @access  Private
exports.getProfitLoss = catchAsync(async (req, res) => {
  const { startDate, endDate, locationId } = req.query;

  const matchStage = {
    locationId: mongoose.Types.ObjectId(locationId || req.user.location),
    paymentStatus: 'paid'
  };

  if (startDate || endDate) {
    matchStage['timing.orderedAt'] = {};
    if (startDate) matchStage['timing.orderedAt'].$gte = new Date(startDate);
    if (endDate) matchStage['timing.orderedAt'].$lte = new Date(endDate);
  }

  const pnl = await Order.aggregate([
    { $match: matchStage },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'menuitems',
        localField: 'items.menuItemId',
        foreignField: '_id',
        as: 'menuItem'
      }
    },
    { $unwind: '$menuItem' },
    {
      $group: {
        _id: {
          year: { $year: '$timing.orderedAt' },
          month: { $month: '$timing.orderedAt' },
          day: { $dayOfMonth: '$timing.orderedAt' }
        },
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        cost: { 
          $sum: { 
            $multiply: [
              { $ifNull: ['$menuItem.cost', 0] }, 
              '$items.quantity'
            ] 
          } 
        },
        orders: { $sum: 1 }
      }
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        revenue: 1,
        cost: 1,
        profit: { $subtract: ['$revenue', '$cost'] },
        margin: {
          $multiply: [
            { $divide: [
              { $subtract: ['$revenue', '$cost'] },
              '$revenue'
            ] },
            100
          ]
        },
        orders: 1
      }
    },
    { $sort: { date: 1 } }
  ]);

  res.json({
    success: true,
    data: pnl
  });
});

// @desc    Get tax report
// @route   GET /api/reports/financial/tax
// @access  Private
exports.getTaxReport = catchAsync(async (req, res) => {
  const { startDate, endDate, locationId } = req.query;

  const matchStage = {
    locationId: mongoose.Types.ObjectId(locationId || req.user.location),
    paymentStatus: 'paid'
  };

  if (startDate || endDate) {
    matchStage['timing.orderedAt'] = {};
    if (startDate) matchStage['timing.orderedAt'].$gte = new Date(startDate);
    if (endDate) matchStage['timing.orderedAt'].$lte = new Date(endDate);
  }

  const taxData = await Order.aggregate([
    { $match: matchStage },
    { $unwind: '$taxBreakdown' },
    {
      $group: {
        _id: {
          name: '$taxBreakdown.name',
          rate: '$taxBreakdown.rate'
        },
        totalTax: { $sum: '$taxBreakdown.amount' },
        taxableAmount: { $sum: '$subtotal' }
      }
    },
    { $sort: { '_id.name': 1 } }
  ]);

  const summary = {
    totalTaxCollected: taxData.reduce((sum, item) => sum + item.totalTax, 0),
    byRate: taxData
  };

  res.json({
    success: true,
    data: summary
  });
});

// @desc    Get top selling items
// @route   GET /api/reports/top-items
// @access  Private
exports.getTopSellingItems = catchAsync(async (req, res) => {
  const { 
    startDate, 
    endDate, 
    limit = 10,
    locationId 
  } = req.query;

  const matchStage = {
    locationId: mongoose.Types.ObjectId(locationId || req.user.location),
    paymentStatus: 'paid'
  };

  if (startDate || endDate) {
    matchStage['timing.orderedAt'] = {};
    if (startDate) matchStage['timing.orderedAt'].$gte = new Date(startDate);
    if (endDate) matchStage['timing.orderedAt'].$lte = new Date(endDate);
  }

  const topItems = await Order.aggregate([
    { $match: matchStage },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.menuItemId',
        name: { $first: '$items.name' },
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
      }
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: parseInt(limit) }
  ]);

  res.json({
    success: true,
    data: topItems
  });
});

// @desc    Generate and export report
// @route   POST /api/reports/generate
// @access  Private
exports.generateReport = catchAsync(async (req, res) => {
  const { type, format = 'json', ...filters } = req.body;

  let data;
  switch (type) {
    case 'sales':
      data = await exports.getSalesReport(req, res);
      break;
    case 'inventory':
      data = await exports.getInventoryReport(req, res);
      break;
    case 'employees':
      data = await exports.getEmployeeReport(req, res);
      break;
    case 'customers':
      data = await exports.getCustomerReport(req, res);
      break;
    case 'financial':
      data = await exports.getFinancialReport(req, res);
      break;
    default:
      throw new AppError('Invalid report type', 400);
  }

  if (format === 'json') {
    return res.json(data);
  }

  // Generate file
  const filename = `${type}_report_${Date.now()}.${format}`;
  const filepath = path.join(__dirname, '../../reports', filename);

  if (format === 'excel') {
    await generateExcelReport(data, filepath, type);
  } else if (format === 'pdf') {
    await generatePDFReport(data, filepath, type);
  } else if (format === 'csv') {
    await generateCSVReport(data, filepath, type);
  }

  res.json({
    success: true,
    data: {
      filename,
      downloadUrl: `/reports/${filename}`
    }
  });
});

// @desc    Export report by ID
// @route   GET /api/reports/export/:id
// @access  Private
exports.exportReport = catchAsync(async (req, res) => {
  const { id } = req.params;
  const filepath = path.join(__dirname, '../../reports', id);

  if (!fs.existsSync(filepath)) {
    throw new AppError('Report file not found', 404);
  }

  res.download(filepath);
});

// Helper functions for report generation
async function generateExcelReport(data, filepath, type) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(type);

  // Add headers
  const headers = Object.keys(data[0] || {});
  worksheet.addRow(headers);

  // Add data
  data.forEach(item => {
    worksheet.addRow(Object.values(item));
  });

  await workbook.xlsx.writeFile(filepath);
}

async function generatePDFReport(data, filepath, type) {
  const doc = new PDFDocument();
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  doc.fontSize(16).text(`${type.toUpperCase()} REPORT`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown();

  // Add data as table
  if (Array.isArray(data) && data.length > 0) {
    const headers = Object.keys(data[0]);
    let y = doc.y;

    // Draw headers
    doc.font('Helvetica-Bold');
    headers.forEach((header, i) => {
      doc.text(header, 50 + (i * 100), y);
    });

    // Draw data
    doc.font('Helvetica');
    data.forEach((item, rowIndex) => {
      y = doc.y + 20;
      headers.forEach((header, i) => {
        doc.text(String(item[header] || ''), 50 + (i * 100), y + (rowIndex * 20));
      });
    });
  }

  doc.end();
}

async function generateCSVReport(data, filepath, type) {
  if (!Array.isArray(data) || data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => JSON.stringify(row[header] || '')).join(',')
    )
  ];

  fs.writeFileSync(filepath, csvRows.join('\n'));
}