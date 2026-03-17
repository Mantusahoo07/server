const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const locationController = require('../controllers/locationController');
const { checkPermission } = require('../middleware/auth');

// Location routes
router.get('/',
  checkPermission('view_locations'),
  locationController.getLocations
);

router.get('/:id',
  checkPermission('view_locations'),
  param('id').isMongoId(),
  locationController.getLocationById
);

router.post('/',
  checkPermission('create_locations'),
  locationController.createLocation
);

router.patch('/:id',
  checkPermission('update_locations'),
  param('id').isMongoId(),
  locationController.updateLocation
);

router.delete('/:id',
  checkPermission('delete_locations'),
  param('id').isMongoId(),
  locationController.deleteLocation
);

// Table routes
router.get('/:locationId/tables',
  checkPermission('view_locations'),
  param('locationId').isMongoId(),
  locationController.getTables
);

router.post('/:locationId/tables',
  checkPermission('update_locations'),
  param('locationId').isMongoId(),
  locationController.createTable
);

router.patch('/:locationId/tables/:tableId',
  checkPermission('update_locations'),
  param('locationId').isMongoId(),
  param('tableId').isMongoId(),
  locationController.updateTable
);

router.delete('/:locationId/tables/:tableId',
  checkPermission('update_locations'),
  param('locationId').isMongoId(),
  param('tableId').isMongoId(),
  locationController.deleteTable
);

// Transfer routes
router.post('/transfers',
  checkPermission('transfer_stock'),
  locationController.transferStock
);

router.get('/transfers',
  checkPermission('view_locations'),
  locationController.getTransfers
);

module.exports = router;