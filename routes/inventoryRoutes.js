const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const inventoryController = require('../controllers/inventoryController');
const { checkPermission } = require('../middleware/auth');

// Ingredient routes
router.get('/',
  checkPermission('view_inventory'),
  inventoryController.getInventory
);

router.get('/low-stock',
  checkPermission('view_inventory'),
  inventoryController.getLowStock
);

router.get('/expiring',
  checkPermission('view_inventory'),
  inventoryController.getExpiringItems
);

router.get('/:id',
  checkPermission('view_inventory'),
  param('id').isMongoId(),
  inventoryController.getIngredientById
);

router.post('/',
  checkPermission('manage_inventory'),
  inventoryController.createIngredient
);

router.patch('/:id',
  checkPermission('manage_inventory'),
  param('id').isMongoId(),
  inventoryController.updateIngredient
);

router.post('/:id/adjust',
  checkPermission('adjust_inventory'),
  param('id').isMongoId(),
  body('quantity').isNumeric(),
  body('reason').notEmpty(),
  inventoryController.adjustInventory
);

router.delete('/:id',
  checkPermission('manage_inventory'),
  param('id').isMongoId(),
  inventoryController.deleteIngredient
);

// Transaction routes
router.get('/transactions',
  checkPermission('view_inventory'),
  inventoryController.getTransactions
);

// Supplier routes
router.get('/suppliers',
  checkPermission('view_inventory'),
  inventoryController.getSuppliers
);

router.post('/suppliers',
  checkPermission('manage_inventory'),
  inventoryController.createSupplier
);

router.patch('/suppliers/:id',
  checkPermission('manage_inventory'),
  param('id').isMongoId(),
  inventoryController.updateSupplier
);

// Purchase order routes
router.get('/purchase-orders',
  checkPermission('view_inventory'),
  inventoryController.getPurchaseOrders
);

router.post('/purchase-orders',
  checkPermission('create_purchase_orders'),
  inventoryController.createPurchaseOrder
);

router.post('/purchase-orders/:id/receive',
  checkPermission('receive_purchase_orders'),
  param('id').isMongoId(),
  inventoryController.receivePurchaseOrder
);

module.exports = router;