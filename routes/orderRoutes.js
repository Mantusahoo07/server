const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const orderController = require('../controllers/orderController');
const { checkPermission } = require('../middleware/auth');

// Validation rules
const orderValidation = [
  body('orderType').isIn(['dine-in', 'takeaway', 'delivery', 'curbside']),
  body('items').isArray().notEmpty(),
  body('items.*.menuItemId').isMongoId(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('items.*.price').isFloat({ min: 0 })
];

// Routes
router.get('/', 
  checkPermission('view_orders'),
  orderController.getOrders
);

router.get('/stats/overview',
  checkPermission('view_reports'),
  orderController.getOrderStats
);

router.get('/kitchen',
  checkPermission('view_kitchen_orders'),
  orderController.getKitchenOrders
);

router.get('/summary/daily',
  checkPermission('view_reports'),
  orderController.getDailySummary
);

router.get('/:id',
  checkPermission('view_orders'),
  param('id').isMongoId(),
  orderController.getOrderById
);

router.post('/',
  checkPermission('create_order'),
  orderValidation,
  orderController.createOrder
);

router.patch('/:id',
  checkPermission('update_orders'),
  param('id').isMongoId(),
  orderController.updateOrder
);

router.patch('/:id/status',
  checkPermission('update_order_status'),
  param('id').isMongoId(),
  body('status').isIn(['confirmed', 'preparing', 'ready', 'completed', 'cancelled']),
  orderController.updateOrderStatus
);

router.patch('/:orderId/items/:itemId/status',
  checkPermission('update_kitchen_status'),
  param('orderId').isMongoId(),
  param('itemId').isMongoId(),
  body('status').isIn(['pending', 'preparing', 'ready']),
  orderController.updateItemStatus
);

router.post('/:id/payments',
  checkPermission('process_payment'),
  param('id').isMongoId(),
  orderController.addPayment
);

router.post('/:id/refund',
  checkPermission('process_refund'),
  param('id').isMongoId(),
  orderController.processRefund
);

module.exports = router;