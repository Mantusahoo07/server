const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const reportController = require('../controllers/reportController');
const { checkPermission } = require('../middleware/auth');

// Sales reports
router.get('/sales',
  checkPermission('view_sales_reports'),
  reportController.getSalesReport
);

router.get('/sales/daily',
  checkPermission('view_sales_reports'),
  reportController.getDailySales
);

router.get('/sales/hourly',
  checkPermission('view_sales_reports'),
  reportController.getHourlySales
);

// Inventory reports
router.get('/inventory',
  checkPermission('view_inventory_reports'),
  reportController.getInventoryReport
);

router.get('/inventory/valuation',
  checkPermission('view_inventory_reports'),
  reportController.getInventoryValuation
);

router.get('/inventory/movement',
  checkPermission('view_inventory_reports'),
  reportController.getInventoryMovement
);

// Employee reports
router.get('/employees',
  checkPermission('view_employee_reports'),
  reportController.getEmployeeReport
);

router.get('/employees/performance',
  checkPermission('view_employee_reports'),
  reportController.getEmployeePerformance
);

// Customer reports
router.get('/customers',
  checkPermission('view_customer_reports'),
  reportController.getCustomerReport
);

router.get('/customers/loyalty',
  checkPermission('view_customer_reports'),
  reportController.getLoyaltyReport
);

// Financial reports
router.get('/financial',
  checkPermission('view_financial_reports'),
  reportController.getFinancialReport
);

router.get('/financial/pnl',
  checkPermission('view_financial_reports'),
  reportController.getProfitLoss
);

router.get('/financial/tax',
  checkPermission('view_financial_reports'),
  reportController.getTaxReport
);

// Top items
router.get('/top-items',
  checkPermission('view_reports'),
  reportController.getTopSellingItems
);

// Export reports
router.post('/generate',
  checkPermission('generate_reports'),
  reportController.generateReport
);

router.get('/export/:id',
  checkPermission('export_reports'),
  reportController.exportReport
);

module.exports = router;