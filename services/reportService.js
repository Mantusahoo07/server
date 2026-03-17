const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const Order = require('../models/Order');
const Inventory = require('../models/Inventory');
const Customer = require('../models/Customer');
const Employee = require('../models/Employee');
const logger = require('./logger');

class ReportService {
  constructor() {
    this.reportDir = path.join(__dirname, '../../reports');
    
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  // Sales Report
  async generateSalesReport(locationId, filters) {
    const { startDate, endDate, groupBy = 'day', format = 'pdf' } = filters;
    
    const query = {
      locationId,
      'timing.orderedAt': {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      paymentStatus: 'paid'
    };

    const orders = await Order.find(query)
      .populate('items.menuItemId')
      .populate('serverId')
      .sort('timing.orderedAt');

    // Group data
    const groupedData = this.groupSalesData(orders, groupBy);

    // Calculate totals
    const totals = this.calculateSalesTotals(orders);

    const reportData = {
      title: 'Sales Report',
      period: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      groupBy,
      totals,
      groupedData,
      orders: orders.length
    };

    // Generate in requested format
    switch (format) {
      case 'pdf':
        return await this.generatePDFReport('sales', reportData);
      case 'excel':
        return await this.generateExcelReport('sales', reportData);
      case 'csv':
        return await this.generateCSVReport('sales', orders);
      default:
        return reportData;
    }
  }

  // Inventory Report
  async generateInventoryReport(locationId, filters) {
    const { includeZeroStock = false, category } = filters;

    const query = { locationId };
    if (!includeZeroStock) {
      query.quantity = { $gt: 0 };
    }
    if (category && category !== 'all') {
      query.category = category;
    }

    const inventory = await Inventory.Ingredient.find(query)
      .populate('supplierInfo.primarySupplier')
      .sort('category name');

    const transactions = await Inventory.InventoryTransaction.find({
      locationId,
      createdAt: {
        $gte: new Date(new Date().setDate(new Date().getDate() - 30))
      }
    }).sort('-createdAt').limit(100);

    const lowStock = inventory.filter(item => item.quantity <= item.minQuantity);
    const expiringSoon = inventory.filter(item => {
      if (!item.expiryDate) return false;
      const daysUntilExpiry = Math.ceil((item.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    });

    const reportData = {
      title: 'Inventory Report',
      generatedAt: new Date().toISOString(),
      summary: {
        totalItems: inventory.length,
        totalValue: inventory.reduce((sum, item) => sum + (item.quantity * (item.cost.current || 0)), 0),
        lowStockCount: lowStock.length,
        expiringSoonCount: expiringSoon.length
      },
      items: inventory,
      lowStock,
      expiringSoon,
      recentTransactions: transactions
    };

    return reportData;
  }

  // Employee Performance Report
  async generateEmployeeReport(locationId, filters) {
    const { startDate, endDate, employeeId } = filters;

    const query = {
      locationId,
      'timing.orderedAt': {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      paymentStatus: 'paid'
    };

    if (employeeId) {
      query.serverId = employeeId;
    }

    const orders = await Order.find(query)
      .populate('serverId')
      .populate('items.preparedBy');

    // Group by employee
    const employeeStats = {};

    orders.forEach(order => {
      // Server stats
      if (order.serverId) {
        const serverId = order.serverId._id.toString();
        if (!employeeStats[serverId]) {
          employeeStats[serverId] = {
            employee: order.serverId,
            orders: 0,
            sales: 0,
            tips: 0,
            avgOrderValue: 0
          };
        }
        employeeStats[serverId].orders++;
        employeeStats[serverId].sales += order.total;
        employeeStats[serverId].tips += order.payments.reduce((sum, p) => sum + (p.tip || 0), 0);
      }

      // Kitchen staff stats
      order.items.forEach(item => {
        if (item.preparedBy) {
          const cookId = item.preparedBy._id.toString();
          if (!employeeStats[cookId]) {
            employeeStats[cookId] = {
              employee: item.preparedBy,
              itemsPrepared: 0,
              avgPreparationTime: 0
            };
          }
          if (!employeeStats[cookId].itemsPrepared) {
            employeeStats[cookId].itemsPrepared = 0;
          }
          employeeStats[cookId].itemsPrepared++;
        }
      });
    });

    // Calculate averages
    Object.values(employeeStats).forEach(stat => {
      if (stat.orders) {
        stat.avgOrderValue = stat.sales / stat.orders;
      }
    });

    const reportData = {
      title: 'Employee Performance Report',
      period: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      employeeStats: Object.values(employeeStats)
    };

    return reportData;
  }

  // Customer Analysis Report
  async generateCustomerReport(locationId, filters) {
    const { startDate, endDate, segment } = filters;

    const customerQuery = { locationId };
    
    if (segment) {
      switch (segment) {
        case 'new':
          customerQuery.createdAt = { $gte: new Date(startDate) };
          break;
        case 'active':
          customerQuery['statistics.lastVisit'] = { $gte: new Date(new Date().setDate(new Date().getDate() - 30)) };
          break;
        case 'vip':
          customerQuery['loyalty.tier'] = { $in: ['gold', 'platinum'] };
          break;
      }
    }

    const customers = await Customer.Customer.find(customerQuery)
      .sort('-statistics.totalSpent');

    const orders = await Order.find({
      locationId,
      customerId: { $in: customers.map(c => c._id) },
      'timing.orderedAt': {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    });

    // Calculate customer metrics
    const customerMetrics = customers.map(customer => {
      const customerOrders = orders.filter(o => o.customerId?.toString() === customer._id.toString());
      
      return {
        ...customer.toObject(),
        orderCount: customerOrders.length,
        periodSpend: customerOrders.reduce((sum, o) => sum + o.total, 0),
        avgOrderValue: customerOrders.length > 0 
          ? customerOrders.reduce((sum, o) => sum + o.total, 0) / customerOrders.length 
          : 0
      };
    });

    const reportData = {
      title: 'Customer Analysis Report',
      period: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: {
        totalCustomers: customers.length,
        activeCustomers: customers.filter(c => {
          const lastVisit = new Date(c.statistics?.lastVisit);
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return lastVisit >= thirtyDaysAgo;
        }).length,
        totalSpend: orders.reduce((sum, o) => sum + o.total, 0),
        averageSpendPerCustomer: orders.reduce((sum, o) => sum + o.total, 0) / customers.length || 0
      },
      customers: customerMetrics
    };

    return reportData;
  }

  // Helper methods
  groupSalesData(orders, groupBy) {
    const grouped = {};

    orders.forEach(order => {
      let key;
      const date = new Date(order.timing.orderedAt);

      switch (groupBy) {
        case 'hour':
          key = date.getHours().toString().padStart(2, '0') + ':00';
          break;
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          break;
        default:
          key = date.toISOString().split('T')[0];
      }

      if (!grouped[key]) {
        grouped[key] = {
          period: key,
          orderCount: 0,
          revenue: 0,
          byType: {},
          byPayment: {}
        };
      }

      grouped[key].orderCount++;
      grouped[key].revenue += order.total;

      // Group by order type
      if (!grouped[key].byType[order.orderType]) {
        grouped[key].byType[order.orderType] = 0;
      }
      grouped[key].byType[order.orderType] += order.total;

      // Group by payment method
      order.payments.forEach(payment => {
        if (!grouped[key].byPayment[payment.method]) {
          grouped[key].byPayment[payment.method] = 0;
        }
        grouped[key].byPayment[payment.method] += payment.amount;
      });
    });

    return Object.values(grouped).sort((a, b) => a.period.localeCompare(b.period));
  }

  calculateSalesTotals(orders) {
    return {
      orderCount: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
      averageOrderValue: orders.reduce((sum, o) => sum + o.total, 0) / orders.length || 0,
      byType: orders.reduce((acc, o) => {
        acc[o.orderType] = (acc[o.orderType] || 0) + o.total;
        return acc;
      }, {}),
      byPayment: orders.reduce((acc, o) => {
        o.payments.forEach(p => {
          acc[p.method] = (acc[p.method] || 0) + p.amount;
        });
        return acc;
      }, {})
    };
  }

  // PDF Generation
  async generatePDFReport(type, data) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const filename = `${type}_${Date.now()}.pdf`;
      const filepath = path.join(this.reportDir, filename);
      
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Add header
      doc.fontSize(20).text(data.title, { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, { align: 'center' });
      if (data.period) {
        doc.text(`Period: ${data.period}`, { align: 'center' });
      }
      doc.moveDown();

      // Add summary
      if (data.totals) {
        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(12);
        doc.text(`Total Orders: ${data.totals.orderCount}`);
        doc.text(`Total Revenue: $${data.totals.totalRevenue.toFixed(2)}`);
        doc.text(`Average Order Value: $${data.totals.averageOrderValue.toFixed(2)}`);
        doc.moveDown();
      }

      // Add table
      if (data.groupedData) {
        doc.fontSize(14).text('Detailed Breakdown', { underline: true });
        doc.moveDown();

        const tableTop = doc.y;
        const tableHeaders = ['Period', 'Orders', 'Revenue'];
        
        // Draw table headers
        doc.font('Helvetica-Bold');
        let x = 50;
        tableHeaders.forEach(header => {
          doc.text(header, x, tableTop);
          x += header === 'Period' ? 150 : 100;
        });
        
        // Draw table rows
        doc.font('Helvetica');
        let y = tableTop + 20;
        data.groupedData.forEach(row => {
          x = 50;
          doc.text(row.period, x, y);
          x += 150;
          doc.text(row.orderCount.toString(), x, y);
          x += 100;
          doc.text(`$${row.revenue.toFixed(2)}`, x, y);
          y += 20;

          // New page if needed
          if (y > 700) {
            doc.addPage();
            y = 50;
          }
        });
      }

      doc.end();

      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    });
  }

  // Excel Generation
  async generateExcelReport(type, data) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(type);

    // Add title
    worksheet.mergeCells('A1:E1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = data.title;
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    // Add metadata
    worksheet.addRow(['Generated:', new Date(data.generatedAt).toLocaleString()]);
    if (data.period) {
      worksheet.addRow(['Period:', data.period]);
    }
    worksheet.addRow([]);

    // Add summary
    if (data.totals) {
      worksheet.addRow(['Summary']);
      worksheet.addRow(['Total Orders:', data.totals.orderCount]);
      worksheet.addRow(['Total Revenue:', data.totals.totalRevenue]);
      worksheet.addRow(['Average Order Value:', data.totals.averageOrderValue]);
      worksheet.addRow([]);
    }

    // Add detailed data
    if (data.groupedData) {
      worksheet.addRow(['Detailed Breakdown']);
      worksheet.addRow(['Period', 'Orders', 'Revenue']);
      
      data.groupedData.forEach(row => {
        worksheet.addRow([row.period, row.orderCount, row.revenue]);
      });
    }

    // Style the worksheet
    worksheet.columns.forEach(column => {
      column.width = 20;
    });

    const filename = `${type}_${Date.now()}.xlsx`;
    const filepath = path.join(this.reportDir, filename);
    
    await workbook.xlsx.writeFile(filepath);
    return filepath;
  }

  // CSV Generation
  async generateCSVReport(type, data) {
    const filename = `${type}_${Date.now()}.csv`;
    const filepath = path.join(this.reportDir, filename);
    
    const headers = ['Order ID', 'Date', 'Type', 'Items', 'Subtotal', 'Tax', 'Total', 'Status'];
    const rows = data.map(order => [
      order.orderNumber,
      new Date(order.timing.orderedAt).toLocaleString(),
      order.orderType,
      order.items.length,
      order.subtotal.toFixed(2),
      order.tax.toFixed(2),
      order.total.toFixed(2),
      order.orderStatus
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    fs.writeFileSync(filepath, csvContent);
    return filepath;
  }

  // Schedule report generation
  async scheduleReport(reportConfig) {
    const { type, locationId, filters, schedule, recipients } = reportConfig;
    
    // Store schedule in database
    const scheduledReport = {
      type,
      locationId,
      filters,
      schedule,
      recipients,
      createdAt: new Date(),
      lastRun: null,
      nextRun: this.calculateNextRun(schedule)
    };

    // TODO: Save to database and set up cron job
    
    return scheduledReport;
  }

  calculateNextRun(schedule) {
    // Simple implementation - in production use a proper cron parser
    const now = new Date();
    
    switch (schedule) {
      case 'daily':
        return new Date(now.setDate(now.getDate() + 1));
      case 'weekly':
        return new Date(now.setDate(now.getDate() + 7));
      case 'monthly':
        return new Date(now.setMonth(now.getMonth() + 1));
      default:
        return now;
    }
  }
}

module.exports = new ReportService();