const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const menuController = require('../controllers/menuController');
const { checkPermission } = require('../middleware/auth');

// Menu item routes
router.get('/',
  checkPermission('view_menu'),
  menuController.getMenuItems
);

router.get('/categories',
  checkPermission('view_menu'),
  menuController.getCategories
);

router.get('/structure',
  checkPermission('view_menu'),
  menuController.getMenuStructure
);

router.get('/:id',
  checkPermission('view_menu'),
  param('id').isMongoId(),
  menuController.getMenuItemById
);

router.get('/', menuController.getMenuItems);

router.post('/',
  checkPermission('manage_menu'),
  menuController.createMenuItem
);

router.patch('/:id',
  checkPermission('manage_menu'),
  param('id').isMongoId(),
  menuController.updateMenuItem
);

router.patch('/:id/availability',
  checkPermission('manage_menu'),
  param('id').isMongoId(),
  body('available').isBoolean(),
  menuController.updateAvailability
);

router.delete('/:id',
  checkPermission('manage_menu'),
  param('id').isMongoId(),
  menuController.deleteMenuItem
);

// Category routes
router.post('/categories',
  checkPermission('manage_menu'),
  body('name').notEmpty(),
  menuController.createCategory
);

router.put('/categories/:id',
  checkPermission('manage_menu'),
  param('id').isMongoId(),
  menuController.updateCategory
);

router.delete('/categories/:id',
  checkPermission('manage_menu'),
  param('id').isMongoId(),
  menuController.deleteCategory
);

module.exports = router;
